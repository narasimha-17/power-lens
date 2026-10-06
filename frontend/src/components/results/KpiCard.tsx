import { Info, type LucideIcon } from 'lucide-react'
import { formatValue, humanizeFieldName } from '../../lib/format'

const ICON_BG = ['bg-blue-100 text-blue-600', 'bg-emerald-100 text-emerald-600', 'bg-violet-100 text-violet-600', 'bg-amber-100 text-amber-600']

export function KpiCard({
  field,
  value,
  icon: Icon,
  slot,
  info,
}: {
  field: string
  value: unknown
  icon: LucideIcon
  slot: number
  info?: string
}) {
  const colorClass = ICON_BG[slot % ICON_BG.length]

  return (
    <div className="relative flex h-full flex-col justify-center rounded-2xl border border-slate-200 bg-white p-4 dark:border-navy-700 dark:bg-navy-800">
      {info && (
        <div className="group absolute right-3 top-3">
          <Info className="h-3.5 w-3.5 cursor-help text-slate-300 hover:text-slate-500 dark:text-navy-600 dark:hover:text-slate-400" />
          <div className="pointer-events-none absolute right-0 top-5 z-20 w-56 rounded-lg bg-slate-800 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-navy-950">
            {info}
          </div>
        </div>
      )}
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full ${colorClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-2xl font-semibold text-slate-800 dark:text-white">{formatValue(value)}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{humanizeFieldName(field)}</div>
    </div>
  )
}
