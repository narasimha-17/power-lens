import { AlertCircle, CheckCircle2, FileText, MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { AppLayout } from '../components/layout/AppLayout'
import { AiLogPanel } from '../components/results/AiLogPanel'
import { StatCard } from '../components/overview/StatCard'
import { useAppState } from '../state/AppState'

export function ReportsPage() {
  const { history } = useAppState()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const succeeded = history.filter((h) => h.answer).length
  const failed = history.filter((h) => h.error).length

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800 dark:text-white">Reports</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Every question you've asked, kept as a lightweight report you can revisit.
            </p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Generate Report
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Questions Asked" value={history.length} icon={MessageSquare} slot={0} />
          <StatCard label="Answered" value={succeeded} icon={CheckCircle2} slot={1} />
          <StatCard label="Failed" value={failed} icon={AlertCircle} slot={2} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white dark:border-navy-700 dark:bg-navy-800">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-navy-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">AI Query Log</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Every question sent to the model, with its response, generated SQL, and timing.
            </p>
          </div>
          {history.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">
              No logs yet — ask a question on Ask your Data.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-navy-700">
              {history.map((h) => (
                <div key={h.id}>
                  <div className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <div>
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {h.question}
                        </div>
                        <div className="text-xs text-slate-400">
                          {h.sourceName} • {new Date(h.askedAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          h.error
                            ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30'
                            : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30'
                        }`}
                      >
                        {h.error ? 'Failed' : 'Ready'}
                      </span>
                      <button
                        onClick={() => setExpandedId((prev) => (prev === h.id ? null : h.id))}
                        className="text-sm font-medium text-brand-600 hover:underline"
                      >
                        {expandedId === h.id ? 'Hide' : 'View log'}
                      </button>
                    </div>
                  </div>
                  {expandedId === h.id && (
                    <div className="px-5 pb-4">
                      {h.answer ? (
                        <AiLogPanel answer={h.answer} askedAt={h.askedAt} />
                      ) : (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:border-rose-900 dark:bg-rose-950/30">
                          {h.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-navy-800"
          >
            <h2 className="mb-2 text-base font-semibold text-slate-800 dark:text-white">
              Generate New Report
            </h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Reports here are built from the questions you ask PowerLens — head to{' '}
              <span className="font-medium">Ask your Data</span> to create a new one. Scheduled,
              multi-question report generation isn't built yet.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 dark:border-navy-700 dark:text-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
