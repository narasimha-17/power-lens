import { AlertCircle, MessageSquare } from 'lucide-react'
import { AppLayout } from '../components/layout/AppLayout'
import { useAppState } from '../state/AppState'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

export function QueryHistoryPage() {
  const { history } = useAppState()

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-3 p-6">
        <h1 className="mb-4 text-2xl font-semibold text-slate-800 dark:text-white">Query History</h1>
        {history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400 dark:border-navy-700 dark:bg-navy-800">
            No questions asked yet.
          </div>
        ) : (
          history.map((h) => (
            <div
              key={h.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-navy-700 dark:bg-navy-800"
            >
              <div className="flex items-start gap-2">
                {h.error ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                ) : (
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {h.question}
                  </div>
                  <div className="text-xs text-slate-400">
                    {h.sourceName} • {formatDate(h.askedAt)}
                  </div>
                  {h.error && <div className="mt-1 text-xs text-rose-500">{h.error}</div>}
                  {h.answer && (
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {h.answer.objective} — {h.answer.result.row_count} rows in{' '}
                      {h.answer.execution_ms.toFixed(0)}ms
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </AppLayout>
  )
}
