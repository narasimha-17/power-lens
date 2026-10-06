import { Check, Cloud, Database, Lightbulb, Loader2, Pin, Plug, Sparkles, Table2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { extractErrorMessage, runBiAnalysis, runQuery } from '../../api/client'
import { AnswerResultView } from '../results/AnswerResultView'
import { ConnectCloudPanel } from '../source/ConnectCloudPanel'
import { ConnectDatabasePanel } from '../source/ConnectDatabasePanel'
import { UploadFilesPanel } from '../source/UploadFilesPanel'
import { getEstimatedRunMs, recordRunDuration } from '../../lib/runTimeEstimator'
import { useAppState } from '../../state/AppState'
import type { BiRecommendedQuestion, QueryAnswer } from '../../types'

const SUGGESTION_PRIORITY_STYLES: Record<string, string> = {
  Critical: 'border-rose-200 text-rose-700 dark:border-rose-900 dark:text-rose-300',
  High: 'border-amber-200 text-amber-700 dark:border-amber-900 dark:text-amber-300',
  Medium: 'border-sky-200 text-sky-700 dark:border-sky-900 dark:text-sky-300',
  Low: 'border-slate-200 text-slate-500 dark:border-navy-700 dark:text-slate-400',
}

type SourceTab = 'existing' | 'upload' | 'database' | 'cloud'

const SOURCE_TABS: { id: SourceTab; label: string; icon: typeof Database }[] = [
  { id: 'existing', label: 'Existing Sources', icon: Database },
  { id: 'upload', label: 'Upload Files', icon: Table2 },
  { id: 'database', label: 'Connect Database', icon: Plug },
  { id: 'cloud', label: 'Cloud & API', icon: Cloud },
]

export function NewDashboardModal({
  dashboardId,
  onClose,
}: {
  dashboardId?: string
  onClose: () => void
}) {
  const {
    sources,
    activeSourceId,
    setActiveSourceId,
    addHistoryEntry,
    dashboards,
    createDashboard,
    deleteDashboard,
    beginDashboardBuild,
    endDashboardBuild,
    addChartToDashboard,
  } = useAppState()

  const [createdId, setCreatedId] = useState<string | undefined>(dashboardId)
  const dashboard = dashboards.find((d) => d.id === createdId)
  const [name, setName] = useState('')

  // Adding a chart to a dashboard that already has charts reuses that dashboard's data
  // source — the user just wants to ask another question, not pick a source again.
  const dashboardSourceId = dashboard?.charts[0]?.sourceId
  const skipSourcePicker = !!dashboardSourceId

  const [sourceTab, setSourceTab] = useState<SourceTab>(sources.length > 0 ? 'existing' : 'upload')
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [answer, setAnswer] = useState<QueryAnswer | null>(null)
  const [pinned, setPinned] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [estimatedMs, setEstimatedMs] = useState<number | null>(null)
  const [autoBusy, setAutoBusy] = useState(false)
  const [autoDone, setAutoDone] = useState<{ dashboardName: string; chartCount: number } | null>(null)
  const [suggestions, setSuggestions] = useState<BiRecommendedQuestion[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)

  // A dashboard's original source can go missing after a backend restart if it was a live
  // SQL/API connection (those are kept in memory only, never written to disk) — reusing that
  // source silently would just produce a wall of broken, half-failed UI (a grayed-out
  // auto-generate button, a "couldn't load suggestions" note, a question box that will also
  // fail). Detect it up front and show one clear message with a way to reconnect instead.
  const [forceReconnect, setForceReconnect] = useState(false)
  const showSourcePicker = !skipSourcePicker || forceReconnect
  const effectiveSourceId = skipSourcePicker && !forceReconnect ? dashboardSourceId : activeSourceId
  const activeSource = sources.find((s) => s.id === effectiveSourceId)
  const sourceDisconnected = skipSourcePicker && !forceReconnect && !!dashboardSourceId && !activeSource

  useEffect(() => {
    if (skipSourcePicker && !forceReconnect && dashboardSourceId && dashboardSourceId !== activeSourceId) {
      setActiveSourceId(dashboardSourceId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipSourcePicker, forceReconnect, dashboardSourceId])

  useEffect(() => {
    if (!busy) return
    const start = Date.now()
    setElapsedMs(0)
    const interval = setInterval(() => setElapsedMs(Date.now() - start), 200)
    return () => clearInterval(interval)
  }, [busy])

  // Surface real, dataset-grounded business questions (the same "AI Business Analyst"
  // pipeline as its own page) right where the user is about to type a question — so a vague
  // request like "generate a meaningful dashboard" has good, clickable answers right there
  // instead of being typed into the single-question box and failing.
  useEffect(() => {
    if (!effectiveSourceId) {
      setSuggestions([])
      setSuggestError(null)
      return
    }
    let cancelled = false
    setSuggestLoading(true)
    setSuggestError(null)
    setSuggestions([])
    // enrich=false: this is a quick suggestions list, not the dedicated analysis page — skip
    // the single LLM rationale-rewriting call (often several seconds on a local model) and
    // use the already-correct template rationales instead.
    runBiAnalysis(effectiveSourceId, false)
      .then((result) => {
        if (!cancelled) setSuggestions(result.recommended_questions.slice(0, 8))
      })
      .catch((err) => {
        if (!cancelled) setSuggestError(extractErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setSuggestLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [effectiveSourceId])

  // Stages are framed as fractions of the estimated total time, so "analyzing" through
  // "executing" line up with how far along a *typical* run for this source actually is —
  // instead of firing on a fixed clock that's meaningless for a 200-table source vs. a
  // 20-row one.
  const STAGES = [
    { until: 0.15, label: 'Analyzing the data source…' },
    { until: 0.45, label: 'Asking the local model to write SQL…' },
    { until: 0.6, label: 'Validating the generated query…' },
    { until: 0.9, label: 'Running the ETL query against your data…' },
    { until: 1, label: 'Finalizing results…' },
  ]
  const progressFraction = estimatedMs ? elapsedMs / estimatedMs : null
  const loadingStage = progressFraction
    ? (STAGES.find((s) => progressFraction <= s.until) ?? STAGES[STAGES.length - 1]).label
    : elapsedMs < 8000
      ? 'Analyzing the data source…'
      : 'Asking the local model to write SQL and running it…'
  const remainingMs = estimatedMs !== null ? Math.max(0, estimatedMs - elapsedMs) : null
  const progressPct = progressFraction !== null ? Math.min(96, progressFraction * 100) : null

  async function handleRun(questionOverride?: string) {
    const finalQuestion = questionOverride ?? question
    if (!effectiveSourceId || !finalQuestion.trim()) return
    setQuestion(finalQuestion)
    setBusy(true)
    setError(null)
    setAnswer(null)
    setPinned(false)
    setEstimatedMs(getEstimatedRunMs(effectiveSourceId))
    const runStart = Date.now()
    try {
      const result = await runQuery(effectiveSourceId, finalQuestion)
      setAnswer(result)
      recordRunDuration(effectiveSourceId, Date.now() - runStart)
      addHistoryEntry({
        id: crypto.randomUUID(),
        sourceId: effectiveSourceId,
        sourceName: activeSource?.name ?? 'Unknown source',
        question: finalQuestion,
        askedAt: new Date().toISOString(),
        answer: result,
      })
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleAutoGenerate() {
    if (!effectiveSourceId) return
    if (suggestions.length === 0) {
      setError(
        suggestLoading
          ? 'Still finding meaningful business questions in this data — try again in a moment.'
          : "Couldn't find any suggested questions for this data — try asking a specific question below.",
      )
      return
    }
    setAutoBusy(true)
    setAutoDone(null)
    setError(null)
    const targetName = name.trim() || activeSource?.name || 'New Dashboard'
    // Create the dashboard right away rather than only once every chart is built — so it
    // shows up on the dashboards list marked as generating immediately, even if this modal
    // gets closed before all the questions have finished running.
    const draft = !createdId ? createDashboard(targetName) : null
    if (draft) {
      setCreatedId(draft.id)
      beginDashboardBuild(draft.id)
    }
    const targetDashboardId = draft?.id ?? createdId!
    const sourceName = activeSource?.name ?? 'Unknown source'
    // Build the dashboard from the same "Suggested business questions" already shown above,
    // rather than a separate hidden agent picking its own questions — what the user sees is
    // exactly what gets charted. Run sequentially (not Promise.all) since these all hit the
    // same local LLM/query pipeline, which handles one request at a time anyway.
    let successCount = 0
    try {
      for (const suggestion of suggestions) {
        try {
          const result = await runQuery(effectiveSourceId, suggestion.question)
          addChartToDashboard(targetDashboardId, {
            question: suggestion.question,
            sourceId: effectiveSourceId,
            sourceName,
            answer: result,
          })
          successCount++
        } catch {
          // Best-effort — one suggestion the query pipeline couldn't turn into SQL
          // shouldn't abort the rest of the dashboard.
        }
      }
      if (successCount === 0) {
        if (draft) deleteDashboard(draft.id)
        setError("Couldn't build any charts from the suggested questions — try asking a specific question below.")
        return
      }
      setAutoDone({ dashboardName: targetName, chartCount: successCount })
    } catch (err) {
      if (draft) deleteDashboard(draft.id)
      setError(extractErrorMessage(err))
    } finally {
      if (draft) endDashboardBuild(draft.id)
      setAutoBusy(false)
    }
  }

  function handlePin() {
    if (!answer) return
    let targetId = createdId
    if (!targetId) {
      const created = createDashboard(name)
      targetId = created.id
      setCreatedId(targetId)
    }
    const sourceName = activeSource?.name ?? 'Unknown source'
    // A compound question gets split into several charts (see extra_answers) — pin all of
    // them together as independent charts, so the user gets everything they asked for
    // instead of just the first part. Clear extra_answers on each so a pinned chart never
    // re-renders the others nested inside itself.
    const allAnswers = [answer, ...(answer.extra_answers ?? [])]
    for (const a of allAnswers) {
      addChartToDashboard(targetId, {
        question: a.objective,
        sourceId: effectiveSourceId ?? '',
        sourceName,
        answer: { ...a, extra_answers: undefined },
      })
    }
    setPinned(true)
  }

  function handleAskAnother() {
    setQuestion('')
    setAnswer(null)
    setPinned(false)
  }

  const readyToRun = !!effectiveSourceId && (!!dashboard || name.trim().length > 0)
  // Auto-generate doesn't need a typed name — handleAutoGenerate already falls back to the
  // source's own name when none is given, so requiring one here (like readyToRun does for
  // manual questions) would disable the button for no real reason.
  const readyToAutoGenerate = !!effectiveSourceId

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="scrollbar-thin max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-navy-800"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-navy-700">
          <h2 className="text-base font-semibold text-slate-800 dark:text-white">
            {dashboard ? dashboard.name : 'New Dashboard'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {!dashboard && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Dashboard name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sales Dashboard"
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
              />
            </div>
          )}

          {sourceDisconnected && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="mb-1 text-sm font-medium text-amber-800 dark:text-amber-300">
                This dashboard's data source is disconnected
              </div>
              <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">
                "{dashboard?.charts[0]?.sourceName ?? 'The original source'}" was a live database
                connection, which isn't saved across a backend restart for security. Reconnect it
                to add more charts to this dashboard.
              </p>
              <button
                onClick={() => setForceReconnect(true)}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                Reconnect a data source
              </button>
            </div>
          )}

          {showSourcePicker && (
          <div>
            <div className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Choose a data source
            </div>
            <div className="mb-3 flex gap-1 overflow-x-auto border-b border-slate-100 dark:border-navy-700">
              {SOURCE_TABS.filter((t) => t.id !== 'existing' || sources.length > 0).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setSourceTab(id)}
                  className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
                    sourceTab === id
                      ? 'border-brand-500 font-medium text-brand-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            {sourceTab === 'existing' && sources.length > 0 && (
              <select
                value={activeSourceId ?? ''}
                onChange={(e) => setActiveSourceId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 [color-scheme:light] dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300 dark:[color-scheme:dark]"
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            {sourceTab === 'upload' && <UploadFilesPanel />}
            {sourceTab === 'database' && <ConnectDatabasePanel />}
            {sourceTab === 'cloud' && <ConnectCloudPanel />}
          </div>
          )}

          {!autoDone && !sourceDisconnected && (
            <div>
              {suggestLoading && (
                <div className="mb-3 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding meaningful business questions in this data…
                </div>
              )}
              {!suggestLoading && suggestions.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Suggested business questions
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleRun(s.question)}
                        disabled={busy || autoBusy}
                        title={s.why_it_matters}
                        className={`rounded-full border bg-white px-3 py-1.5 text-left text-xs font-medium hover:bg-slate-50 disabled:opacity-50 dark:bg-navy-900 dark:hover:bg-navy-800 ${SUGGESTION_PRIORITY_STYLES[s.priority] ?? SUGGESTION_PRIORITY_STYLES.Low}`}
                      >
                        {s.question}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!suggestLoading && suggestError && (
                <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
                  Couldn't load suggested questions — you can still ask your own below.
                </p>
              )}

              <div className="my-3 flex items-center gap-3 text-xs text-slate-400">
                <div className="h-px flex-1 bg-slate-100 dark:bg-navy-700" />
                or generate a full dashboard automatically
                <div className="h-px flex-1 bg-slate-100 dark:bg-navy-700" />
              </div>
              <button
                onClick={handleAutoGenerate}
                disabled={!readyToAutoGenerate || autoBusy || busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50 dark:border-brand-900/50 dark:bg-brand-950/20 dark:text-brand-300 dark:hover:bg-brand-950/40"
              >
                {autoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {autoBusy ? 'Analyzing your data and building charts…' : 'Auto-generate a full dashboard from this data'}
              </button>
            </div>
          )}

          {autoDone && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
              <div className="flex items-center gap-1.5 font-medium">
                <Check className="h-4 w-4" /> Built "{autoDone.dashboardName}" with {autoDone.chartCount} chart
                {autoDone.chartCount === 1 ? '' : 's'}.
              </div>
              <button
                onClick={onClose}
                className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Done
              </button>
            </div>
          )}

          {!autoDone && !sourceDisconnected && (
          <div>
            <div className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Ask a question
            </div>
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRun()}
                disabled={!readyToRun}
                placeholder={
                  !effectiveSourceId
                    ? 'Connect a source first…'
                    : !dashboard && !name.trim()
                      ? 'Name your dashboard first…'
                      : 'e.g. What is the total revenue by month?'
                }
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none disabled:opacity-50 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200"
              />
              <button
                onClick={() => handleRun()}
                disabled={!readyToRun || !question.trim() || busy}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {busy ? 'Running…' : 'Run'}
              </button>
            </div>
          </div>
          )}

          {busy && (
            <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 dark:border-brand-900/40 dark:bg-brand-950/20">
              <div className="flex items-center gap-3">
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-40" />
                  <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white">
                    <Sparkles className="h-4 w-4" />
                  </span>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-brand-700 dark:text-brand-300">
                    {loadingStage}
                  </div>
                  <div className="text-xs text-brand-500 dark:text-brand-400">
                    {(elapsedMs / 1000).toFixed(0)}s elapsed
                    {remainingMs !== null
                      ? ` — about ${Math.ceil(remainingMs / 1000)}s remaining (based on past runs on this source)`
                      : ' — first run on this source, timing not learned yet'}
                  </div>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-900/40">
                <div
                  className={`h-full rounded-full bg-brand-500 transition-all duration-200 ${
                    progressPct === null ? 'w-1/3 animate-pulse' : ''
                  }`}
                  style={progressPct !== null ? { width: `${progressPct}%` } : undefined}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600 dark:border-rose-900 dark:bg-rose-950/30">
              {error}
            </div>
          )}

          {answer && (
            <div className="space-y-3">
              <AnswerResultView answer={answer} />
              <div className="flex items-center gap-2">
                {!pinned ? (
                  <button
                    onClick={handlePin}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    <Pin className="h-3.5 w-3.5" />
                    Pin to Dashboard
                  </button>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                      Pinned
                    </span>
                    <button
                      onClick={handleAskAnother}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-navy-700 dark:text-slate-300 dark:hover:bg-navy-900"
                    >
                      + Ask another question
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {dashboard && dashboard.charts.length > 0 && (
            <div className="border-t border-slate-100 pt-3 text-sm text-slate-500 dark:border-navy-700 dark:text-slate-400">
              {dashboard.charts.length} chart{dashboard.charts.length === 1 ? '' : 's'} pinned to{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">{dashboard.name}</span>.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
