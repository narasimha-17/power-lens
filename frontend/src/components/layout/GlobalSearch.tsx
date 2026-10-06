import { BarChart3, Database, MessageSquare, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../../state/AppState'

export function GlobalSearch() {
  const { dashboards, sources, history } = useAppState()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return { dashboards: [], sources: [], history: [] }
    return {
      dashboards: dashboards.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 5),
      sources: sources.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 5),
      history: history.filter((h) => h.question.toLowerCase().includes(q)).slice(0, 5),
    }
  }, [query, dashboards, sources, history])

  const hasResults = results.dashboards.length > 0 || results.sources.length > 0 || results.history.length > 0

  function go(path: string) {
    navigate(path)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search dashboards, sources, questions..."
        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none dark:border-navy-700 dark:bg-navy-800 dark:text-slate-200 dark:placeholder:text-slate-500"
      />
      {query && (
        <button
          onClick={() => setQuery('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {open && query && (
        <div className="absolute left-0 top-full z-30 mt-2 w-96 rounded-xl border border-slate-200 bg-white shadow-lg dark:border-navy-700 dark:bg-navy-800">
          {!hasResults ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">No matches for "{query}".</p>
          ) : (
            <div className="scrollbar-thin max-h-96 overflow-y-auto py-2">
              {results.dashboards.length > 0 && (
                <div className="px-2">
                  <p className="px-2 py-1 text-xs font-semibold uppercase text-slate-400">Dashboards</p>
                  {results.dashboards.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => go(`/dashboards/${d.id}`)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-navy-900"
                    >
                      <BarChart3 className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      <span className="truncate">{d.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.sources.length > 0 && (
                <div className="px-2">
                  <p className="px-2 py-1 text-xs font-semibold uppercase text-slate-400">Data Sources</p>
                  {results.sources.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => go('/sources')}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-navy-900"
                    >
                      <Database className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      <span className="truncate">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.history.length > 0 && (
                <div className="px-2">
                  <p className="px-2 py-1 text-xs font-semibold uppercase text-slate-400">Questions Asked</p>
                  {results.history.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => go('/history')}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-navy-900"
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                      <span className="truncate">{h.question}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
