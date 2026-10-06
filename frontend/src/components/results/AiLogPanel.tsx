import { Clock, ListChecks, Terminal } from 'lucide-react'
import { humanizeFieldName } from '../../lib/format'
import type { ChartSpec, QueryAnswer } from '../../types'

// The model never returns a separate "plan" field — its objective (what the query should
// answer) plus the chart_hint it picked (how to visualize the result) together ARE its
// plan, decided before it wrote any SQL. Render both so the log shows what it intended to
// do, not just what it produced.
function describeChartPlan(spec: ChartSpec): string {
  const type = spec.chart_type.replace('_', ' ')
  if (spec.chart_type === 'kpi') return `Show ${spec.y_fields.map(humanizeFieldName).join(', ')} as a KPI card`
  if (spec.chart_type === 'table') return 'Show the result as a raw data table'
  const y = spec.y_fields.map(humanizeFieldName).join(', ')
  const x = spec.x_field ? humanizeFieldName(spec.x_field) : null
  const series = spec.series_field ? `, split by ${humanizeFieldName(spec.series_field)}` : ''
  return x ? `Plot ${y} as a ${type} chart over ${x}${series}` : `Plot ${y} as a ${type} chart`
}

function LogRow({ answer, index }: { answer: QueryAnswer; index: number }) {
  return (
    <div className={index > 0 ? 'border-t border-slate-100 pt-4 dark:border-navy-700' : ''}>
      <div className="mb-3 flex items-start gap-2">
        <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">AI Plan</div>
          <div className="text-sm text-slate-700 dark:text-slate-200">{answer.objective}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">{describeChartPlan(answer.chart_spec)}</div>
        </div>
      </div>

      <div className="mb-3 flex items-start gap-2">
        <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">SQL Generated</div>
          <pre className="scrollbar-thin mt-1 overflow-x-auto rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-navy-900 dark:text-slate-300">
            {answer.sql}
          </pre>
        </div>
      </div>

      <div className="flex items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Time Log</div>
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Executed in {answer.execution_ms.toFixed(0)} ms • {answer.result.row_count} row
            {answer.result.row_count === 1 ? '' : 's'} returned
          </div>
        </div>
      </div>
    </div>
  )
}

export function AiLogPanel({ answer, askedAt }: { answer: QueryAnswer; askedAt: string }) {
  const allAnswers = [answer, ...(answer.extra_answers ?? [])]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white dark:border-navy-700 dark:bg-navy-800">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-navy-700">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">AI Log</h3>
        <span className="text-xs text-slate-400">{new Date(askedAt).toLocaleString()}</span>
      </div>
      <div className="space-y-4 px-4 py-4">
        {allAnswers.map((a, i) => (
          <LogRow key={i} answer={a} index={i} />
        ))}
      </div>
    </div>
  )
}
