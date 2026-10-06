import { AlertTriangle, Hash, Info, Layers, Sparkles, TrendingUp, X } from 'lucide-react'
import { useState } from 'react'
import type { InsightIcon } from '../../lib/insights'
import { buildInsightCards } from '../../lib/insights'
import type { QueryAnswer } from '../../types'

const ICON_MAP: Record<InsightIcon, typeof Sparkles> = {
  objective: Sparkles,
  stats: Hash,
  leader: TrendingUp,
  drivers: Layers,
  warning: AlertTriangle,
}

const ICON_BG: Record<InsightIcon, string> = {
  objective: 'bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300',
  stats: 'bg-slate-100 text-slate-500 dark:bg-navy-700 dark:text-slate-300',
  leader: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
  drivers: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300',
  warning: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
}

export function InsightsPopover({ answer }: { answer: QueryAnswer }) {
  const [open, setOpen] = useState(false)
  const cards = buildInsightCards(answer)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="AI Insights"
        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:text-brand-600 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-500"
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-20 w-72 rounded-xl border border-slate-200 bg-white shadow-lg dark:border-navy-700 dark:bg-navy-800">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-navy-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">AI Insights</h3>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="scrollbar-thin max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-navy-700">
            {cards.map((card, i) => {
              const Icon = ICON_MAP[card.icon]
              return (
                <div key={i} className="flex gap-3 px-4 py-3">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ICON_BG[card.icon]}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{card.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{card.description}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
