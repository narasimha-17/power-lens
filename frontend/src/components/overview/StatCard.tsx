import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react'
import { formatValue } from '../../lib/format'

const ICON_BG = [
  'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',
  'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
  'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300',
  'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
]

export function StatCard({
  label,
  value,
  icon: Icon,
  slot,
  deltaPct,
}: {
  label: string
  value: unknown
  icon: LucideIcon
  slot: number
  deltaPct?: number | null
}) {
  const hasDelta = deltaPct !== undefined && deltaPct !== null && Number.isFinite(deltaPct)
  const isUp = hasDelta && deltaPct! >= 0

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-navy-700 dark:bg-navy-800">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${ICON_BG[slot % ICON_BG.length]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-2xl font-semibold text-slate-800 dark:text-white">{formatValue(value)}</div>
      {hasDelta && (
        <div
          className={`mt-1 flex items-center gap-1 text-xs font-medium ${
            isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {Math.abs(deltaPct!).toFixed(1)}%
          <span className="font-normal text-slate-400">vs previous month</span>
        </div>
      )}
    </div>
  )
}
