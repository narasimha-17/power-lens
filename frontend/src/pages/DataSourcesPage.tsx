import { Database, FileSpreadsheet, History, Link2, Plug, RefreshCw, Radio, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  deleteDataSource,
  extractErrorMessage,
  fetchRecentSqlConnections,
  refreshDataSource,
  setDataSourceSchedule,
} from '../api/client'
import { AppLayout } from '../components/layout/AppLayout'
import { ConnectCloudPanel } from '../components/source/ConnectCloudPanel'
import { ConnectDatabasePanel } from '../components/source/ConnectDatabasePanel'
import { ConnectLiveDataPanel } from '../components/source/ConnectLiveDataPanel'
import { TableRelationshipsModal } from '../components/source/TableRelationshipsModal'
import { UploadFilesPanel } from '../components/source/UploadFilesPanel'
import { useAppState } from '../state/AppState'
import type { RecentSqlConnection, SourceInfo } from '../types'

const TYPE_ICON = { file: FileSpreadsheet, sql: Database, live: Radio }

const SCHEDULE_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'No auto-refresh', value: null },
  { label: 'Every 5 min', value: 5 * 60 },
  { label: 'Every 15 min', value: 15 * 60 },
  { label: 'Hourly', value: 60 * 60 },
  { label: 'Daily', value: 24 * 60 * 60 },
]

type Tab = 'upload' | 'database' | 'cloud' | 'live'

const PANEL_WIDTH_KEY = 'datapilot.sourcesPanelWidth'
const MIN_PANEL_WIDTH = 300
const MAX_PANEL_WIDTH = 560

function loadPanelWidth(): number {
  try {
    const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY))
    if (saved >= MIN_PANEL_WIDTH && saved <= MAX_PANEL_WIDTH) return saved
  } catch {
    // ignore
  }
  return 360
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function DataSourcesPage() {
  const { sources, refreshSources, activeSourceId, setActiveSourceId } = useAppState()
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('upload')
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [panelWidth, setPanelWidth] = useState(loadPanelWidth)
  const [dragging, setDragging] = useState(false)
  const [isLgUp, setIsLgUp] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  const rowRef = useRef<HTMLDivElement>(null)
  const [recentConnections, setRecentConnections] = useState<RecentSqlConnection[]>([])
  const [prefillConnection, setPrefillConnection] = useState<RecentSqlConnection | null>(null)
  const [relationshipsSource, setRelationshipsSource] = useState<SourceInfo | null>(null)

  useEffect(() => {
    fetchRecentSqlConnections()
      .then(setRecentConnections)
      .catch(() => undefined)
  }, [sources])

  function handleReconnect(c: RecentSqlConnection) {
    setTab('database')
    setPrefillConnection(c)
  }

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    const onChange = () => setIsLgUp(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!dragging) return
    function onMove(e: MouseEvent) {
      const row = rowRef.current
      if (!row) return
      const rect = row.getBoundingClientRect()
      const next = Math.round(Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, rect.right - e.clientX)))
      setPanelWidth(next)
    }
    function onUp() {
      setDragging(false)
      try {
        localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth))
      } catch {
        // ignore
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  async function handleDelete(id: string) {
    try {
      await deleteDataSource(id)
      await refreshSources()
      if (activeSourceId === id) setActiveSourceId(null)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function handleRefreshNow(id: string) {
    setRefreshingId(id)
    try {
      await refreshDataSource(id)
      await refreshSources()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setRefreshingId(null)
    }
  }

  async function handleScheduleChange(id: string, intervalS: number | null) {
    try {
      await setDataSourceSchedule(id, intervalS)
      await refreshSources()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-white">Data Sources</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage the files, databases, and feeds PowerLens can query.
          </p>
        </div>

        <div ref={rowRef} className={`flex flex-col gap-6 lg:flex-row ${dragging ? 'select-none' : ''}`}>
          <div className="min-w-0 flex-1 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-navy-700 dark:bg-navy-800">
            <div className="border-b border-slate-100 px-5 py-4 dark:border-navy-700">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Connected Sources
              </h2>
            </div>
            {error && <div className="px-5 py-2 text-sm text-rose-500">{error}</div>}
            {sources.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-400">
                No data sources connected yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-navy-700">
                {sources.map((s) => {
                  const Icon = TYPE_ICON[s.source_type]
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between px-5 py-3 ${
                        s.id === activeSourceId ? 'bg-brand-50 dark:bg-brand-900/20' : ''
                      }`}
                    >
                      <button
                        onClick={() => setActiveSourceId(s.id)}
                        className="flex flex-1 items-center gap-3 text-left"
                      >
                        <Icon className="h-4 w-4 text-slate-400" />
                        <div>
                          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {s.name}
                          </div>
                          <div className="text-xs text-slate-400">
                            {s.source_type} • connected {timeAgo(s.last_refreshed)}
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-1">
                        <select
                          value={String(s.refresh_interval_s ?? '')}
                          onChange={(e) => handleScheduleChange(s.id, e.target.value ? Number(e.target.value) : null)}
                          title="Auto-refresh schedule"
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-500 [color-scheme:light] dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300 dark:[color-scheme:dark]"
                        >
                          {SCHEDULE_OPTIONS.map((opt) => (
                            <option key={opt.label} value={opt.value ?? ''}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {s.source_type === 'sql' && (
                          <button
                            onClick={() => setRelationshipsSource(s)}
                            title="Manage table relationships"
                            className="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/20"
                          >
                            <Link2 className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleRefreshNow(s.id)}
                          disabled={refreshingId === s.id}
                          title="Refresh now"
                          className="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/20"
                        >
                          <RefreshCw className={`h-4 w-4 ${refreshingId === s.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {recentConnections.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white dark:border-navy-700 dark:bg-navy-800">
              <div className="flex items-center gap-1.5 border-b border-slate-100 px-5 py-4 dark:border-navy-700">
                <History className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Recent Connections
                </h2>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-navy-700">
                {recentConnections.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Database className="h-4 w-4 text-slate-400" />
                      <div>
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {c.display_name}
                        </div>
                        <div className="text-xs text-slate-400">
                          {c.dialect} • {c.user}@{c.host}:{c.port}/{c.database}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleReconnect(c)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-navy-700 dark:text-slate-300 dark:hover:bg-navy-900"
                    >
                      <Plug className="h-3.5 w-3.5" />
                      Connect
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>

          <div
            onMouseDown={() => setDragging(true)}
            title="Drag to resize"
            className="group hidden w-2.5 shrink-0 cursor-col-resize items-stretch justify-center lg:flex"
          >
            <div
              className={`w-px transition-colors group-hover:bg-brand-400 ${
                dragging ? 'bg-brand-500' : 'bg-slate-200 dark:bg-navy-700'
              }`}
            />
          </div>

          <div
            style={isLgUp ? { width: panelWidth } : undefined}
            className="w-full shrink-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-navy-700 dark:bg-navy-800"
          >
            <div className="mb-3 flex gap-1 overflow-x-auto border-b border-slate-100 dark:border-navy-700">
              {(
                [
                  ['upload', 'Upload'],
                  ['database', 'Database'],
                  ['cloud', 'Cloud & API'],
                  ['live', 'Live'],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`shrink-0 border-b-2 px-3 py-2 text-sm transition-colors ${
                    tab === id
                      ? 'border-brand-500 font-medium text-brand-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === 'upload' && <UploadFilesPanel />}
            {tab === 'database' && (
              <ConnectDatabasePanel
                prefill={prefillConnection}
                onPrefillApplied={() => setPrefillConnection(null)}
              />
            )}
            {tab === 'cloud' && <ConnectCloudPanel />}
            {tab === 'live' && <ConnectLiveDataPanel />}
          </div>
        </div>
      </div>
      {relationshipsSource && (
        <TableRelationshipsModal
          sourceId={relationshipsSource.id}
          sourceName={relationshipsSource.name}
          onClose={() => setRelationshipsSource(null)}
        />
      )}
    </AppLayout>
  )
}
