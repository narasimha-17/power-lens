import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  deleteDashboardApi,
  extractErrorMessage,
  fetchDashboards,
  listDataSources,
  persistChart,
  persistDashboard,
  removeChartApi,
  runBiAnalysis,
  runQuery,
  setDashboardFavoriteApi,
  startAutoDashboard,
  updateChartAnswerApi,
  updateChartColorApi,
  updateChartLiveApi,
  updateChartSizeApi,
} from '../api/client'
import { pollAutoDashboardJob } from '../lib/jobPoller'
import type {
  BiAnalysisResult,
  BiRecommendedQuestion,
  Dashboard,
  PinnedChart,
  QueryAnswer,
  QueryHistoryEntry,
  SourceInfo,
  TileSize,
} from '../types'

const HISTORY_KEY = 'datapilot.history'
const THEME_KEY = 'datapilot.theme'
const NOTIFICATIONS_KEY = 'datapilot.notifications'
const KNOWN_SOURCES_KEY = 'datapilot.knownSourceIds'
const DASHBOARDS_KEY = 'datapilot.dashboards'

export interface NotificationEntry {
  id: string
  title: string
  description: string
  createdAt: string
  read: boolean
}

interface AppStateShape {
  sources: SourceInfo[]
  refreshSources: () => Promise<void>
  activeSourceId: string | null
  setActiveSourceId: (id: string | null) => void
  history: QueryHistoryEntry[]
  addHistoryEntry: (entry: QueryHistoryEntry) => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
  notifications: NotificationEntry[]
  markNotificationsRead: () => void
  dashboards: Dashboard[]
  createDashboard: (name: string) => Dashboard
  renameDashboard: (dashboardId: string, name: string) => void
  toggleDashboardFavorite: (dashboardId: string) => void
  /** Dashboard ids currently being auto-generated — shown as a "Draft • generating…" badge
   * on the dashboards list instead of the dashboard silently appearing only once every
   * chart has finished, which could take a while for a large or complex source. */
  buildingDashboardIds: string[]
  beginDashboardBuild: (dashboardId: string) => void
  endDashboardBuild: (dashboardId: string) => void
  deleteDashboard: (dashboardId: string) => void
  addChartToDashboard: (dashboardId: string, chart: Omit<PinnedChart, 'id' | 'pinnedAt'>) => void
  removeChartFromDashboard: (dashboardId: string, chartId: string) => void
  updateChartInDashboard: (dashboardId: string, chartId: string, answer: QueryAnswer) => void
  updateChartColor: (dashboardId: string, chartId: string, color: string) => void
  updateChartSize: (dashboardId: string, chartId: string, size: TileSize) => void
  updateChartLive: (dashboardId: string, chartId: string, live: boolean) => void
  biAnalysis: Record<string, BiAnalysisState>
  runBiAnalysisFor: (sourceId: string) => void
  runSuggestedQuestion: (sourceId: string, question: BiRecommendedQuestion) => void
  /** The "Ask your Data" chat history, keyed by source id — kept here (not page-local
   * useState) for the same reason as biAnalysis: navigating to another page mid-question
   * previously unmounted the chat page, discarding the in-flight request's eventual answer
   * the moment it arrived instead of showing it when the user came back. */
  chatTurns: Record<string, ChatTurn[]>
  askChatQuestion: (sourceId: string, sourceName: string, question: string) => void
}

export interface ChatTurn {
  id: string
  question: string
  answer?: QueryAnswer
  error?: string
  pending?: boolean
}

export interface BiAnalysisState {
  loading: boolean
  result: BiAnalysisResult | null
  error: string | null
  // Charts run from a suggested question, keyed by question id — kept alongside the
  // analysis result for the same reason: surviving navigation away from the page.
  answers: Record<string, QueryAnswer>
  runErrors: Record<string, string>
}

const EMPTY_BI_ANALYSIS: BiAnalysisState = { loading: false, result: null, error: null, answers: {}, runErrors: {} }

const AppStateContext = createContext<AppStateShape | null>(null)

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function loadTheme(): 'light' | 'dark' {
  try {
    return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') ?? 'light'
  } catch {
    return 'light'
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<SourceInfo[]>([])
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null)
  const [history, setHistory] = useState<QueryHistoryEntry[]>(() => loadJson(HISTORY_KEY, []))
  const [theme, setTheme] = useState<'light' | 'dark'>(loadTheme)
  const [notifications, setNotifications] = useState<NotificationEntry[]>(() =>
    loadJson(NOTIFICATIONS_KEY, []),
  )
  const [dashboards, setDashboards] = useState<Dashboard[]>(() => loadJson(DASHBOARDS_KEY, []))
  const knownSourceIds = useRef<Set<string>>(new Set(loadJson<string[]>(KNOWN_SOURCES_KEY, [])))
  // Kept here (rather than as page-local state) so an in-progress or completed analysis
  // survives navigating away from the AI Business Analyst page and back — a page-local
  // useState was silently discarding the result the moment the user switched to another
  // page while it was still running.
  const [biAnalysis, setBiAnalysis] = useState<Record<string, BiAnalysisState>>({})
  const [chatTurns, setChatTurns] = useState<Record<string, ChatTurn[]>>({})
  const [buildingDashboardIds, setBuildingDashboardIds] = useState<string[]>([])
  // Every dashboard mutation (create, rename, add/remove chart, delete...) fires its backend
  // call in the background rather than being awaited, so the UI never blocks on the network.
  // But that means two calls for the *same* dashboard (e.g. "create" then, moments later,
  // "delete" because auto-generation found nothing chartable) can race and arrive
  // out of order — a delete landing before its own create leaves an empty dashboard behind
  // forever. Chaining each dashboard's calls through this per-id queue guarantees they're
  // sent to the backend in the same order they were made, regardless of individual request
  // timing.
  const dashboardMutationQueue = useRef<Map<string, Promise<unknown>>>(new Map())
  const enqueueDashboardMutation = useCallback((dashboardId: string, run: () => Promise<unknown>) => {
    const previous = dashboardMutationQueue.current.get(dashboardId) ?? Promise.resolve()
    const next = previous.then(run, run)
    dashboardMutationQueue.current.set(dashboardId, next.catch(() => undefined))
    return next
  }, [])

  const pushNotification = useCallback((title: string, description: string) => {
    setNotifications((prev) =>
      [
        { id: crypto.randomUUID(), title, description, createdAt: new Date().toISOString(), read: false },
        ...prev,
      ].slice(0, 30),
    )
  }, [])

  // Dashboards are persisted to the backend database, not just browser localStorage — ids
  // and timestamps are still generated client-side (for instant, network-independent UI
  // updates), and each mutation fires a background persist call so the change survives a
  // reload or a different browser. localStorage remains a same-tab cache only, so the UI has
  // something to show instantly before the initial backend fetch resolves.
  const persistDashboardSafe = useCallback(
    (dashboard: Dashboard) => {
      enqueueDashboardMutation(dashboard.id, () =>
        persistDashboard(dashboard).catch(() =>
          pushNotification('Failed to save dashboard', `"${dashboard.name}" may not persist after reloading.`),
        ),
      )
    },
    [pushNotification, enqueueDashboardMutation],
  )

  const createDashboard = useCallback(
    (name: string) => {
      const now = new Date().toISOString()
      const dashboard: Dashboard = {
        id: crypto.randomUUID(),
        name: name.trim() || 'Untitled Dashboard',
        createdAt: now,
        updatedAt: now,
        charts: [],
        isFavorite: false,
      }
      setDashboards((prev) => [dashboard, ...prev])
      persistDashboardSafe(dashboard)
      return dashboard
    },
    [persistDashboardSafe],
  )

  const renameDashboard = useCallback(
    (dashboardId: string, name: string) => {
      setDashboards((prev) => {
        const updated = prev.map((d) =>
          d.id === dashboardId ? { ...d, name, updatedAt: new Date().toISOString() } : d,
        )
        const renamed = updated.find((d) => d.id === dashboardId)
        if (renamed) persistDashboardSafe(renamed)
        return updated
      })
    },
    [persistDashboardSafe],
  )

  const toggleDashboardFavorite = useCallback(
    (dashboardId: string) => {
      let nextValue = false
      setDashboards((prev) => {
        const updated = prev.map((d) => {
          if (d.id !== dashboardId) return d
          nextValue = !d.isFavorite
          return { ...d, isFavorite: nextValue }
        })
        // Favorited dashboards sort first, same as the backend does on fetch — re-sorting
        // locally keeps the list order consistent immediately, not just after a reload.
        return [...updated].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite))
      })
      enqueueDashboardMutation(dashboardId, () =>
        setDashboardFavoriteApi(dashboardId, nextValue).catch(() =>
          pushNotification('Failed to save favorite', 'This change may not persist after reloading.'),
        ),
      )
    },
    [pushNotification, enqueueDashboardMutation],
  )

  const deleteDashboard = useCallback(
    (dashboardId: string) => {
      setDashboards((prev) => prev.filter((d) => d.id !== dashboardId))
      enqueueDashboardMutation(dashboardId, () =>
        deleteDashboardApi(dashboardId).catch(() =>
          pushNotification('Failed to delete dashboard', 'It may reappear after reloading.'),
        ),
      )
    },
    [pushNotification, enqueueDashboardMutation],
  )

  const addChartToDashboard = useCallback(
    (dashboardId: string, chart: Omit<PinnedChart, 'id' | 'pinnedAt'>) => {
      const fullChart: PinnedChart = { ...chart, id: crypto.randomUUID(), pinnedAt: new Date().toISOString() }
      setDashboards((prev) =>
        prev.map((d) =>
          d.id === dashboardId ? { ...d, updatedAt: new Date().toISOString(), charts: [...d.charts, fullChart] } : d,
        ),
      )
      enqueueDashboardMutation(dashboardId, () =>
        persistChart(dashboardId, fullChart).catch(() =>
          pushNotification('Failed to save chart', `"${fullChart.question}" may not persist after reloading.`),
        ),
      )
    },
    [pushNotification, enqueueDashboardMutation],
  )

  const beginDashboardBuild = useCallback((dashboardId: string) => {
    setBuildingDashboardIds((prev) => (prev.includes(dashboardId) ? prev : [...prev, dashboardId]))
  }, [])

  const endDashboardBuild = useCallback((dashboardId: string) => {
    setBuildingDashboardIds((prev) => prev.filter((id) => id !== dashboardId))
  }, [])

  const runAutoDashboard = useCallback(
    (source: SourceInfo) => {
      pushNotification('Building overview dashboard', `Analyzing "${source.name}"...`)
      // Create a draft dashboard immediately, before the job even starts, so it shows up on
      // the dashboards list right away marked as generating — rather than only appearing
      // once every chart has finished, which can take a while and previously looked like
      // nothing was happening until a toast notification popped up at the very end.
      const draft = createDashboard(source.name)
      beginDashboardBuild(draft.id)
      const stopBuilding = () => endDashboardBuild(draft.id)

      startAutoDashboard(source.id)
        .then(({ job_id }) => {
          // Polls via a Web Worker (see lib/jobPoller.ts) rather than an in-page setTimeout
          // loop, so this keeps running to completion even if the user switches away from
          // this tab while a large dataset's dashboard is still being built.
          pollAutoDashboardJob(
            job_id,
            (job) => {
              stopBuilding()
              if (job.status === 'error' || !job.result) {
                deleteDashboard(draft.id)
                pushNotification('Auto-dashboard failed', job.error ?? 'Unknown error.')
                return
              }
              const okSteps = job.result.steps.filter((s) => s.status === 'ok' && s.answer)
              if (okSteps.length === 0) {
                deleteDashboard(draft.id)
                pushNotification('Auto-dashboard skipped', `Couldn't find anything useful in "${source.name}".`)
                return
              }
              renameDashboard(draft.id, job.result.dashboard_name)
              for (const step of okSteps) {
                addChartToDashboard(draft.id, {
                  question: step.question,
                  sourceId: source.id,
                  sourceName: source.name,
                  answer: step.answer!,
                })
              }
              pushNotification(
                'Overview dashboard ready',
                `"${job.result.dashboard_name}" was created with ${okSteps.length} chart${okSteps.length === 1 ? '' : 's'}.`,
              )
            },
            () => {
              stopBuilding()
              deleteDashboard(draft.id)
              pushNotification('Auto-dashboard failed', `Could not analyze "${source.name}".`)
            },
          )
        })
        .catch(() => {
          stopBuilding()
          deleteDashboard(draft.id)
          pushNotification('Auto-dashboard failed', `Could not analyze "${source.name}".`)
        })
    },
    [pushNotification, createDashboard, renameDashboard, deleteDashboard, addChartToDashboard, beginDashboardBuild, endDashboardBuild],
  )

  const refreshSources = useCallback(async () => {
    const list = await listDataSources()
    for (const s of list) {
      if (!knownSourceIds.current.has(s.id)) {
        knownSourceIds.current.add(s.id)
        pushNotification('Data source connected', `"${s.name}" is ready to query.`)
        runAutoDashboard(s)
      }
    }
    localStorage.setItem(KNOWN_SOURCES_KEY, JSON.stringify([...knownSourceIds.current]))
    setSources(list)
    setActiveSourceId((prev) => prev ?? list[0]?.id ?? null)
  }, [pushNotification, runAutoDashboard])

  useEffect(() => {
    refreshSources().catch(() => undefined)
    // Hydrate dashboards from the backend database — the localStorage-loaded initial state
    // above is just a same-tab cache shown instantly while this resolves. If the backend is
    // unreachable, keep whatever was cached rather than wiping the screen.
    fetchDashboards()
      .then(setDashboards)
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)))
  }, [history])

  useEffect(() => {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications))
  }, [notifications])

  useEffect(() => {
    localStorage.setItem(DASHBOARDS_KEY, JSON.stringify(dashboards))
  }, [dashboards])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const addHistoryEntry = useCallback(
    (entry: QueryHistoryEntry) => {
      setHistory((prev) => [entry, ...prev].slice(0, 50))
      if (entry.error) {
        pushNotification('Question failed', entry.error)
      } else if (entry.answer) {
        pushNotification('Analysis ready', entry.answer.objective)
      }
    },
    [pushNotification],
  )

  const markNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }, [])

  const removeChartFromDashboard = useCallback(
    (dashboardId: string, chartId: string) => {
      setDashboards((prev) =>
        prev.map((d) =>
          d.id === dashboardId
            ? { ...d, updatedAt: new Date().toISOString(), charts: d.charts.filter((c) => c.id !== chartId) }
            : d,
        ),
      )
      enqueueDashboardMutation(dashboardId, () =>
        removeChartApi(dashboardId, chartId).catch(() =>
          pushNotification('Failed to remove chart', 'It may reappear after reloading.'),
        ),
      )
    },
    [pushNotification, enqueueDashboardMutation],
  )

  const updateChartInDashboard = useCallback(
    (dashboardId: string, chartId: string, answer: QueryAnswer) => {
      setDashboards((prev) =>
        prev.map((d) =>
          d.id === dashboardId
            ? {
                ...d,
                updatedAt: new Date().toISOString(),
                charts: d.charts.map((c) => (c.id === chartId ? { ...c, answer } : c)),
              }
            : d,
        ),
      )
      enqueueDashboardMutation(dashboardId, () =>
        updateChartAnswerApi(dashboardId, chartId, answer).catch(() =>
          pushNotification('Failed to save chart update', 'This change may not persist after reloading.'),
        ),
      )
    },
    [pushNotification, enqueueDashboardMutation],
  )

  const updateChartColor = useCallback(
    (dashboardId: string, chartId: string, color: string) => {
      setDashboards((prev) =>
        prev.map((d) =>
          d.id === dashboardId
            ? {
                ...d,
                updatedAt: new Date().toISOString(),
                charts: d.charts.map((c) => (c.id === chartId ? { ...c, color } : c)),
              }
            : d,
        ),
      )
      enqueueDashboardMutation(dashboardId, () =>
        updateChartColorApi(dashboardId, chartId, color).catch(() =>
          pushNotification('Failed to save chart color', 'This change may not persist after reloading.'),
        ),
      )
    },
    [pushNotification, enqueueDashboardMutation],
  )

  const updateChartSize = useCallback(
    (dashboardId: string, chartId: string, size: TileSize) => {
      setDashboards((prev) =>
        prev.map((d) =>
          d.id === dashboardId
            ? {
                ...d,
                updatedAt: new Date().toISOString(),
                charts: d.charts.map((c) => (c.id === chartId ? { ...c, size } : c)),
              }
            : d,
        ),
      )
      enqueueDashboardMutation(dashboardId, () =>
        updateChartSizeApi(dashboardId, chartId, size).catch(() =>
          pushNotification('Failed to save chart size', 'This change may not persist after reloading.'),
        ),
      )
    },
    [pushNotification, enqueueDashboardMutation],
  )

  const updateChartLive = useCallback(
    (dashboardId: string, chartId: string, live: boolean) => {
      setDashboards((prev) =>
        prev.map((d) =>
          d.id === dashboardId
            ? { ...d, charts: d.charts.map((c) => (c.id === chartId ? { ...c, live } : c)) }
            : d,
        ),
      )
      enqueueDashboardMutation(dashboardId, () =>
        updateChartLiveApi(dashboardId, chartId, live).catch(() =>
          pushNotification('Failed to save live setting', 'This change may not persist after reloading.'),
        ),
      )
    },
    [pushNotification, enqueueDashboardMutation],
  )

  // Both fire independently of whatever page happens to be mounted, and write into
  // `biAnalysis` (state on this provider, which never unmounts on route navigation) rather
  // than a page-local useState — so switching to another page and back no longer loses an
  // in-progress or just-completed analysis or chart run.
  const runBiAnalysisFor = useCallback((sourceId: string) => {
    setBiAnalysis((prev) => ({
      ...prev,
      [sourceId]: { ...(prev[sourceId] ?? EMPTY_BI_ANALYSIS), loading: true, error: null, result: null },
    }))
    runBiAnalysis(sourceId)
      .then((result) => {
        setBiAnalysis((prev) => ({
          ...prev,
          [sourceId]: { ...(prev[sourceId] ?? EMPTY_BI_ANALYSIS), loading: false, result, error: null },
        }))
      })
      .catch((err) => {
        setBiAnalysis((prev) => ({
          ...prev,
          [sourceId]: { ...(prev[sourceId] ?? EMPTY_BI_ANALYSIS), loading: false, error: extractErrorMessage(err) },
        }))
      })
  }, [])

  const runSuggestedQuestion = useCallback((sourceId: string, question: BiRecommendedQuestion) => {
    setBiAnalysis((prev) => {
      const current = prev[sourceId] ?? EMPTY_BI_ANALYSIS
      const runErrors = { ...current.runErrors }
      delete runErrors[question.id]
      return { ...prev, [sourceId]: { ...current, runErrors } }
    })
    runQuery(sourceId, question.question)
      .then((answer) => {
        setBiAnalysis((prev) => {
          const current = prev[sourceId] ?? EMPTY_BI_ANALYSIS
          return { ...prev, [sourceId]: { ...current, answers: { ...current.answers, [question.id]: answer } } }
        })
      })
      .catch((err) => {
        setBiAnalysis((prev) => {
          const current = prev[sourceId] ?? EMPTY_BI_ANALYSIS
          return {
            ...prev,
            [sourceId]: { ...current, runErrors: { ...current.runErrors, [question.id]: extractErrorMessage(err) } },
          }
        })
      })
  }, [])

  const askChatQuestion = useCallback(
    (sourceId: string, sourceName: string, question: string) => {
      const id = crypto.randomUUID()
      setChatTurns((prev) => ({
        ...prev,
        [sourceId]: [...(prev[sourceId] ?? []), { id, question, pending: true }],
      }))
      runQuery(sourceId, question)
        .then((answer) => {
          setChatTurns((prev) => ({
            ...prev,
            [sourceId]: (prev[sourceId] ?? []).map((t) => (t.id === id ? { ...t, answer, pending: false } : t)),
          }))
          addHistoryEntry({
            id, sourceId, sourceName, question, askedAt: new Date().toISOString(), answer,
          })
        })
        .catch((err) => {
          const message = extractErrorMessage(err)
          setChatTurns((prev) => ({
            ...prev,
            [sourceId]: (prev[sourceId] ?? []).map((t) => (t.id === id ? { ...t, error: message, pending: false } : t)),
          }))
          addHistoryEntry({
            id, sourceId, sourceName, question, askedAt: new Date().toISOString(), error: message,
          })
        })
    },
    [addHistoryEntry],
  )

  const value = useMemo(
    () => ({
      sources,
      refreshSources,
      activeSourceId,
      setActiveSourceId,
      history,
      addHistoryEntry,
      theme,
      toggleTheme,
      notifications,
      markNotificationsRead,
      dashboards,
      createDashboard,
      renameDashboard,
      toggleDashboardFavorite,
      buildingDashboardIds,
      beginDashboardBuild,
      endDashboardBuild,
      deleteDashboard,
      addChartToDashboard,
      removeChartFromDashboard,
      updateChartInDashboard,
      updateChartColor,
      updateChartSize,
      updateChartLive,
      biAnalysis,
      runBiAnalysisFor,
      runSuggestedQuestion,
      chatTurns,
      askChatQuestion,
    }),
    [
      sources,
      refreshSources,
      activeSourceId,
      history,
      addHistoryEntry,
      theme,
      toggleTheme,
      notifications,
      markNotificationsRead,
      dashboards,
      createDashboard,
      renameDashboard,
      toggleDashboardFavorite,
      buildingDashboardIds,
      beginDashboardBuild,
      endDashboardBuild,
      deleteDashboard,
      addChartToDashboard,
      removeChartFromDashboard,
      updateChartInDashboard,
      updateChartColor,
      updateChartSize,
      updateChartLive,
      biAnalysis,
      runBiAnalysisFor,
      runSuggestedQuestion,
      chatTurns,
      askChatQuestion,
    ],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppStateShape {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}
