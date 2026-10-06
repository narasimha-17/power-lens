import { AlertTriangle, BarChart3, ChevronDown, Database, Download, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { AppLayout } from '../components/layout/AppLayout'
import { AnswerResultView } from '../components/results/AnswerResultView'
import { useAppState, type BiAnalysisState } from '../state/AppState'
import type { BiRecommendedQuestion } from '../types'

const EMPTY_STATE: BiAnalysisState = { loading: false, result: null, error: null, answers: {}, runErrors: {} }

const PRIORITY_STYLES: Record<string, string> = {
  Critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  High: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Medium: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  Low: 'bg-slate-100 text-slate-600 dark:bg-navy-800 dark:text-slate-400',
}

const PRIORITY_ORDER = ['Critical', 'High', 'Medium', 'Low'] as const

const SEVERITY_STYLES: Record<string, string> = {
  high: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300',
  medium: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
  low: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-300',
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-navy-700 dark:bg-navy-800">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-slate-800 dark:text-white">{value}</div>
    </div>
  )
}

export function BIAnalystPage() {
  const { sources, activeSourceId, setActiveSourceId, biAnalysis, runBiAnalysisFor, runSuggestedQuestion } = useAppState()
  const [sourceId, setSourceId] = useState(activeSourceId ?? '')
  // Analysis result, loading state, and chart answers all live in AppState (see
  // state/AppState.tsx) keyed by source id — not page-local — so navigating to another page
  // and back no longer discards an in-progress or just-finished analysis/chart.
  const state = biAnalysis[sourceId] ?? EMPTY_STATE
  const { result, loading, error, answers, runErrors } = state

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [semanticOpen, setSemanticOpen] = useState(true)
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  // Purely cosmetic per-question spinner state — clears itself once the corresponding
  // answer or error lands in the shared state above, regardless of whether this page was
  // mounted the whole time the request was in flight.
  useEffect(() => {
    if (runningIds.size === 0) return
    setRunningIds((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const id of prev) {
        if (answers[id] !== undefined || runErrors[id]) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [answers, runErrors, runningIds])

  function analyze() {
    if (!sourceId) return
    setSelected(new Set())
    setCategoryFilter(null)
    setPriorityFilter(null)
    runBiAnalysisFor(sourceId)
  }

  function runQuestion(q: BiRecommendedQuestion) {
    if (!sourceId) return
    setRunningIds((prev) => new Set(prev).add(q.id))
    runSuggestedQuestion(sourceId, q)
  }

  const categories = useMemo(
    () => Array.from(new Set((result?.recommended_questions ?? []).map((q) => q.category))),
    [result],
  )

  const filtered = useMemo(() => {
    if (!result) return []
    const term = search.trim().toLowerCase()
    return result.recommended_questions.filter((q) => {
      if (categoryFilter && q.category !== categoryFilter) return false
      if (priorityFilter && q.priority !== priorityFilter) return false
      if (term && !q.question.toLowerCase().includes(term)) return false
      return true
    })
  }, [result, categoryFilter, priorityFilter, search])

  function toggleInSet(setter: Dispatch<SetStateAction<Set<string>>>, id: string) {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exportSelected() {
    if (!result) return
    const chosen = result.recommended_questions.filter((q) => selected.has(q.id))
    const blob = new Blob([JSON.stringify(chosen, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'bi-analyst-questions.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AppLayout>
      <div className="flex h-full w-full flex-col overflow-y-auto p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-white">AI Business Analyst</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pick a data source and discover what your business data is telling you.
            </p>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <select
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value)
              setActiveSourceId(e.target.value || null)
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 [color-scheme:light] dark:border-navy-700 dark:bg-navy-800 dark:text-slate-200 dark:[color-scheme:dark]"
          >
            <option value="">Select a data source…</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={analyze}
            disabled={!sourceId || loading}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {result ? 'Re-analyze' : 'Analyze'}
          </button>
          {error && <span className="text-sm text-rose-600 dark:text-rose-400">{error}</span>}
        </div>

        {!result && !loading && (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400 dark:text-slate-500">
            {sources.length === 0
              ? 'Connect a data source first, then come back here to analyze it.'
              : 'Pick a data source above and click Analyze to generate business questions.'}
          </div>
        )}

        {loading && (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-400 dark:text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Profiling the dataset and generating questions…
          </div>
        )}

        {result && (
          <div className="flex flex-1 flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="Rows" value={result.dataset_summary.rows.toLocaleString()} />
              <StatTile label="Columns" value={result.dataset_summary.columns} />
              <StatTile label="Metrics" value={result.semantic_layer.metrics.length} />
              <StatTile label="Dimensions" value={result.semantic_layer.dimensions.length} />
              <StatTile label="Domain" value={result.dataset_summary.domain} />
              <StatTile label="Confidence" value={`${Math.round(result.dataset_summary.confidence * 100)}%`} />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white dark:border-navy-700 dark:bg-navy-800">
              <button
                onClick={() => setSemanticOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <Database className="h-4 w-4 text-brand-500" /> Everything the agent detected
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${semanticOpen ? 'rotate-180' : ''}`} />
              </button>
              {semanticOpen && (
                <div className="flex flex-col gap-5 border-t border-slate-100 px-4 py-4 dark:border-navy-700">
                  <div>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      Business context
                    </h3>
                    <p className="text-sm text-slate-700 dark:text-slate-200">{result.business_context.primary_use_case}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {result.business_context.available_areas.map((a) => (
                        <span
                          key={a}
                          className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                    {result.dataset_summary.secondary_domains.length > 0 && (
                      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                        Also resembles: {result.dataset_summary.secondary_domains.join(', ')}
                      </p>
                    )}
                  </div>

                  {result.semantic_layer.metrics.length > 0 && (
                    <div>
                      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Metrics ({result.semantic_layer.metrics.length})
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-slate-400 dark:text-slate-500">
                              <th className="py-1 pr-4 font-medium">Metric</th>
                              <th className="py-1 pr-4 font-medium">Column</th>
                              <th className="py-1 pr-4 font-medium">Type</th>
                              <th className="py-1 font-medium">Aggregation</th>
                            </tr>
                          </thead>
                          <tbody className="text-slate-700 dark:text-slate-300">
                            {result.semantic_layer.metrics.map((m) => (
                              <tr key={m.column} className="border-t border-slate-50 dark:border-navy-900">
                                <td className="py-1.5 pr-4 font-medium">{m.name}</td>
                                <td className="py-1.5 pr-4 font-mono text-slate-400 dark:text-slate-500">{m.column}</td>
                                <td className="py-1.5 pr-4 capitalize">{m.metric_type.replace('_', ' ')}</td>
                                <td className="py-1.5">{m.aggregation}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {result.semantic_layer.dimensions.length > 0 && (
                    <div>
                      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Dimensions ({result.semantic_layer.dimensions.length})
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-slate-400 dark:text-slate-500">
                              <th className="py-1 pr-4 font-medium">Dimension</th>
                              <th className="py-1 pr-4 font-medium">Column</th>
                              <th className="py-1 pr-4 font-medium">Type</th>
                              <th className="py-1 font-medium">Distinct values</th>
                            </tr>
                          </thead>
                          <tbody className="text-slate-700 dark:text-slate-300">
                            {result.semantic_layer.dimensions.map((d) => (
                              <tr key={d.column} className="border-t border-slate-50 dark:border-navy-900">
                                <td className="py-1.5 pr-4 font-medium">{d.name}</td>
                                <td className="py-1.5 pr-4 font-mono text-slate-400 dark:text-slate-500">{d.column}</td>
                                <td className="py-1.5 pr-4 capitalize">{d.dimension_type.replace('_', ' ')}</td>
                                <td className="py-1.5">{d.distinct_count.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {result.semantic_layer.time_dimensions.length > 0 && (
                    <div>
                      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Time dimensions ({result.semantic_layer.time_dimensions.length})
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-slate-400 dark:text-slate-500">
                              <th className="py-1 pr-4 font-medium">Field</th>
                              <th className="py-1 pr-4 font-medium">Column</th>
                              <th className="py-1 pr-4 font-medium">Range</th>
                              <th className="py-1 font-medium">Spans multiple years</th>
                            </tr>
                          </thead>
                          <tbody className="text-slate-700 dark:text-slate-300">
                            {result.semantic_layer.time_dimensions.map((t) => (
                              <tr key={t.column} className="border-t border-slate-50 dark:border-navy-900">
                                <td className="py-1.5 pr-4 font-medium">{t.name}</td>
                                <td className="py-1.5 pr-4 font-mono text-slate-400 dark:text-slate-500">{t.column}</td>
                                <td className="py-1.5 pr-4">
                                  {t.min_date ?? '—'} → {t.max_date ?? '—'}
                                </td>
                                <td className="py-1.5">{t.spans_multiple_years ? 'Yes' : 'No'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {result.data_quality_warnings.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                {result.data_quality_warnings.map((w) => (
                  <div key={w}>⚠ {w}</div>
                ))}
              </div>
            )}

            {result.signals.length > 0 && (
              <div>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Detected signals
                </h2>
                <div className="flex flex-col gap-2">
                  {result.signals.map((s) => (
                    <div
                      key={s.type + s.description}
                      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${SEVERITY_STYLES[s.severity]}`}
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{s.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search questions..."
                  className="rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-700 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-200"
                />
              </div>
              <button
                onClick={() => setCategoryFilter(null)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${!categoryFilter ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-navy-800 dark:text-slate-300'}`}
              >
                All categories
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategoryFilter(c)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${categoryFilter === c ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-navy-800 dark:text-slate-300'}`}
                >
                  {c}
                </button>
              ))}
              <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-navy-700" />
              {PRIORITY_ORDER.map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(priorityFilter === p ? null : p)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${priorityFilter === p ? PRIORITY_STYLES[p] : 'bg-slate-100 text-slate-500 dark:bg-navy-800 dark:text-slate-400'}`}
                >
                  {p}
                </button>
              ))}
              {selected.size > 0 && (
                <button
                  onClick={exportSelected}
                  className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-navy-700 dark:text-slate-300 dark:hover:bg-navy-800"
                >
                  <Download className="h-3.5 w-3.5" /> Export {selected.size} selected
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {filtered.map((q) => (
                <div
                  key={q.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 dark:border-navy-700 dark:bg-navy-800"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(q.id)}
                      onChange={() => toggleInSet(setSelected, q.id)}
                      className="mt-1 h-4 w-4 accent-brand-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_STYLES[q.priority]}`}>
                          {q.priority}
                        </span>
                        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {q.category}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">· {q.persona}</span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">· score {q.score}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-800 dark:text-white">{q.question}</p>
                      <button
                        onClick={() => toggleInSet(setExpandedIds, q.id)}
                        className="mt-1 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        <ChevronDown className={`h-3 w-3 transition-transform ${expandedIds.has(q.id) ? 'rotate-180' : ''}`} />
                        Why this matters
                      </button>
                      {expandedIds.has(q.id) && (
                        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{q.why_it_matters}</p>
                      )}
                    </div>
                    <button
                      onClick={() => runQuestion(q)}
                      disabled={runningIds.has(q.id)}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {runningIds.has(q.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
                      Analyze
                    </button>
                  </div>
                  {runErrors[q.id] && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{runErrors[q.id]}</p>}
                  {answers[q.id] && !dismissedIds.has(q.id) && (
                    <div className="mt-3 rounded-lg border border-slate-100 p-3 dark:border-navy-700">
                      <AnswerResultView answer={answers[q.id]} onDelete={() => toggleInSet(setDismissedIds, q.id)} />
                    </div>
                  )}
                </div>
              ))}
              {filtered.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No questions match these filters.</p>}
            </div>

            {result.unsupported_analysis.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-400">
                <div className="mb-1 font-semibold">Not available for this dataset:</div>
                {result.unsupported_analysis.map((u) => (
                  <div key={u}>• {u}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
