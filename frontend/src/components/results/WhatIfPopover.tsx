import { SlidersHorizontal, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { rerunQuery, extractErrorMessage } from '../../api/client'
import { findAdjustableLiterals, substituteLiteral, type AdjustableLiteral } from '../../lib/whatIf'
import type { ChartSpec, QueryAnswer } from '../../types'

/** Lets the user drag a slider over a numeric literal already in a chart's SQL (a threshold,
 * a target, a multiplier — whatever the model happened to write in) and see the chart update
 * live against the real data, without saving anything or touching the underlying question.
 * Deliberately ephemeral: closing the popover reverts to the chart's real saved answer, the
 * same way a Power BI what-if parameter is a transient exploration tool, not a permanent
 * edit. */
export function WhatIfPopover({
  sourceId,
  answer,
  onPreview,
}: {
  sourceId: string
  answer: QueryAnswer
  /** Called with a modified answer while previewing, or null to revert to the real answer. */
  onPreview: (answer: QueryAnswer | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [overrides, setOverrides] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const literals = findAdjustableLiterals(answer.sql)

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function scheduleRun(nextOverrides: Record<number, number>) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runWithOverrides(nextOverrides), 350)
  }

  async function runWithOverrides(nextOverrides: Record<number, number>) {
    const active = literals
      .map((l, i) => ({ literal: l, i }))
      .filter(({ i }) => nextOverrides[i] !== undefined)
      .sort((a, b) => b.literal.start - a.literal.start)
    if (active.length === 0) {
      onPreview(null)
      return
    }
    let sql = answer.sql
    for (const { literal, i } of active) {
      sql = substituteLiteral(sql, literal, nextOverrides[i])
    }
    setLoading(true)
    setError(null)
    try {
      const preview = await rerunQuery(sourceId, sql, answer.objective, answer.chart_spec as ChartSpec)
      onPreview(preview)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  function handleChange(i: number, value: number) {
    const next = { ...overrides, [i]: value }
    setOverrides(next)
    scheduleRun(next)
  }

  function handleReset() {
    setOverrides({})
    setError(null)
    onPreview(null)
  }

  function sliderRange(literal: AdjustableLiteral): { min: number; max: number; step: number } {
    if (literal.value === 0) return { min: -100, max: 100, step: 1 }
    const magnitude = Math.abs(literal.value)
    const step = magnitude >= 100 ? Math.round(magnitude / 100) || 1 : magnitude >= 10 ? 0.5 : 0.1
    return { min: Math.min(0, literal.value * 0.2), max: literal.value * 3, step }
  }

  if (literals.length === 0) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="What-if analysis — adjust a value in this chart's query"
        className={`rounded-lg border p-1.5 ${
          Object.keys(overrides).length > 0
            ? 'border-brand-300 bg-brand-50 text-brand-600 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-300'
            : 'border-slate-200 bg-white text-slate-400 hover:text-brand-600 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-500'
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-navy-700 dark:bg-navy-800">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">What-if analysis</h4>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mb-3 text-xs text-slate-400">
            Drag a value below to see how the chart changes — nothing is saved.
          </p>
          <div className="max-h-64 space-y-4 overflow-y-auto">
            {literals.map((literal, i) => {
              const range = sliderRange(literal)
              const current = overrides[i] ?? literal.value
              return (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="truncate font-mono text-slate-400" title={literal.context}>
                      {literal.context}
                    </span>
                    <span className="ml-2 shrink-0 font-semibold text-slate-700 dark:text-slate-200">
                      {current}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={range.min}
                    max={range.max}
                    step={range.step}
                    value={current}
                    onChange={(e) => handleChange(i, Number(e.target.value))}
                    className="w-full accent-brand-600"
                  />
                </div>
              )
            })}
          </div>
          {loading && <p className="mt-3 text-xs text-slate-400">Recalculating…</p>}
          {error && <p className="mt-3 text-xs text-rose-500">{error}</p>}
          {Object.keys(overrides).length > 0 && (
            <button
              onClick={handleReset}
              className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to actual data
            </button>
          )}
        </div>
      )}
    </div>
  )
}
