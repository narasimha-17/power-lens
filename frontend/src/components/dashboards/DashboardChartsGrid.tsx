import { Lightbulb, Trash2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { rerunQuery } from '../../api/client'
import { AnswerResultView } from '../results/AnswerResultView'
import { KpiCard } from '../results/KpiCard'
import { defaultSizeForChartType, planDashboardGrid, TILE_SIZE_CHART_HEIGHT } from '../../lib/chartLayout'
import { pickKpiIcon } from '../../lib/icons'
import { buildInsightCards } from '../../lib/insights'
import type { ChartSpec, DashboardFilter, PinnedChart, QueryAnswer } from '../../types'

// Short enough to feel "live" without hammering the source or the shared DuckDB connection —
// this bypasses the LLM entirely (see `rerunQuery`), so it's cheap, but every chart with live
// on still fires its own request on this interval.
const LIVE_POLL_MS = 10_000

/** Re-runs a live-enabled chart's own SQL on a fixed interval, bypassing the LLM, and pushes
 * the fresh result up through `onUpdate` — separate from the existing scheduled-refresh/alert
 * feature, which re-asks the question through the LLM on a much longer (minutes+) interval. */
function useLivePolling(chart: PinnedChart, onUpdate?: (answer: QueryAnswer) => void) {
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    if (!chart.live || !onUpdateRef.current) return
    let cancelled = false
    const tick = () => {
      rerunQuery(chart.sourceId, chart.answer.sql, chart.answer.objective, chart.answer.chart_spec as ChartSpec)
        .then((answer) => {
          if (!cancelled) onUpdateRef.current?.(answer)
        })
        .catch(() => {
          // A transient failure (source briefly unreachable, etc.) just skips this tick —
          // the next poll will try again rather than surfacing a disruptive error toast.
        })
    }
    const id = setInterval(tick, LIVE_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart.live, chart.sourceId, chart.answer.sql])
}

function DashboardTile({
  chart,
  slotIndex,
  filters,
  onPointClick,
  onDelete,
  onToggleLive,
  onLiveUpdate,
}: {
  chart: PinnedChart
  slotIndex: number
  filters: DashboardFilter[]
  onPointClick: (field: string, value: unknown) => void
  onDelete?: () => void
  onToggleLive?: () => void
  onLiveUpdate?: (answer: QueryAnswer) => void
}) {
  const chartType = chart.answer.chart_spec.chart_type
  const size = defaultSizeForChartType(chartType)
  useLivePolling(chart, onLiveUpdate)

  if (chartType === 'kpi') {
    const field = chart.answer.chart_spec.y_fields[0] ?? chart.answer.result.columns[0]?.name ?? ''
    const value = chart.answer.result.rows[0]?.[field]
    return (
      <div className="group relative h-full">
        <KpiCard field={field} value={value} icon={pickKpiIcon(field)} slot={slotIndex} info={chart.answer.objective} />
        {onDelete && (
          <button
            onClick={onDelete}
            title="Remove from dashboard"
            className="absolute left-2 top-2 rounded p-0.5 text-slate-300 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100 dark:text-navy-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 dark:border-navy-700 dark:bg-navy-800">
      <div className="flex-1 overflow-hidden">
        <AnswerResultView
          answer={chart.answer}
          title={chart.question}
          onDelete={onDelete}
          color={chart.color}
          activeFilters={filters}
          onPointClick={onPointClick}
          height={TILE_SIZE_CHART_HEIGHT[size]}
          sourceId={chart.sourceId}
          live={chart.live}
          onToggleLive={onToggleLive}
        />
      </div>
    </div>
  )
}

/** The dashboard's mosaic chart grid, shared between the editable DashboardDetailPage and
 * the public read-only SharedDashboardPage — `onDeleteChart` is omitted for the read-only
 * view, which hides every tile's delete affordance. */
export function DashboardChartsGrid({
  charts,
  filters,
  onPointClick,
  onDeleteChart,
  onToggleChartLive,
  onChartLiveUpdate,
}: {
  charts: PinnedChart[]
  filters: DashboardFilter[]
  onPointClick: (field: string, value: unknown) => void
  onDeleteChart?: (chartId: string) => void
  /** Both omitted for the public read-only SharedDashboardPage — live refresh is an editing
   * concern, not something a shared view needs to expose. */
  onToggleChartLive?: (chartId: string) => void
  onChartLiveUpdate?: (chartId: string, answer: QueryAnswer) => void
}) {
  const kpiCharts = charts.filter((c) => c.answer.chart_spec.chart_type === 'kpi')
  const otherCharts = charts.filter((c) => c.answer.chart_spec.chart_type !== 'kpi')
  // A couple of KPI cards leave most of a printed page blank — fill it with the same
  // deterministic, no-LLM-needed insight engine that powers each chart's "AI Insights"
  // popover, rather than printing an otherwise near-empty summary page. Only the
  // leader/drivers/warning card types are genuine findings — "objective" just restates the
  // question and "stats" is boilerplate row-count/timing info, neither of which belongs in
  // a report. A chart with no real finding (data too sparse) is skipped rather than padded
  // out with that boilerplate.
  const keyFindings = otherCharts
    .flatMap((c) =>
      buildInsightCards(c.answer)
        .filter((card) => card.icon === 'leader' || card.icon === 'drivers' || card.icon === 'warning')
        .slice(0, 1),
    )
    .slice(0, 6)

  return (
    <>
      {/* The interactive mosaic grid — mixed tile sizes (kpi/gauge/text stay compact,
          breakdowns and comparisons get more room) pack together into explicit rows via
          planDashboardGrid, which also stretches the last tile in any row that doesn't
          already add up to 6 columns. Hidden when printing in favor of the simpler one-
          chart-per-page layout below — a multi-column mosaic doesn't paginate predictably,
          and squeezing a legend-heavy chart into a mosaic tile's cropped height looks worse
          on paper than it does on screen. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:auto-rows-[240px] lg:grid-cols-6 print:hidden">
        {(() => {
          let nextSlotIndex = 0
          return planDashboardGrid(charts).map((slot) =>
            slot.charts.length > 1 ? (
              <div key={slot.charts[0].id} className={`flex flex-col gap-4 ${slot.className}`}>
                {slot.charts.map((chart) => (
                  <div key={chart.id} className="flex-1">
                    <DashboardTile
                      chart={chart}
                      slotIndex={nextSlotIndex++}
                      filters={filters}
                      onPointClick={onPointClick}
                      onDelete={onDeleteChart ? () => onDeleteChart(chart.id) : undefined}
                      onToggleLive={onToggleChartLive ? () => onToggleChartLive(chart.id) : undefined}
                      onLiveUpdate={onChartLiveUpdate ? (answer) => onChartLiveUpdate(chart.id, answer) : undefined}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div key={slot.charts[0].id} className={slot.className}>
                <DashboardTile
                  chart={slot.charts[0]}
                  slotIndex={nextSlotIndex++}
                  filters={filters}
                  onPointClick={onPointClick}
                  onDelete={onDeleteChart ? () => onDeleteChart(slot.charts[0].id) : undefined}
                  onToggleLive={onToggleChartLive ? () => onToggleChartLive(slot.charts[0].id) : undefined}
                  onLiveUpdate={
                    onChartLiveUpdate ? (answer) => onChartLiveUpdate(slot.charts[0].id, answer) : undefined
                  }
                />
              </div>
            ),
          )
        })()}
      </div>

      {/* Print-only: every KPI stat card together on one summary page (the way a printed BI
          report's cover page groups headline numbers), then one real chart per page after
          that, full width/height and never split across a page break. */}
      {/* Always rendered (never `display:none`) — Recharts' ResponsiveContainer measures its
          real DOM size on mount, and a `display:none` ancestor (or one that only becomes
          visible once a browser print event fires, which React can't guarantee finishes
          rendering before the print engine takes its snapshot) measures as 0x0 and draws
          nothing. Clipped to zero visible height on screen with `overflow-hidden` instead —
          the inner content still has a real, fixed width, so every chart is already
          correctly measured and drawn well before the user ever prints; printing then just
          reveals what's already there via a pure CSS media-query switch, no re-render race. */}
      <div className="h-0 overflow-hidden print:h-auto print:overflow-visible" aria-hidden="true">
        <div className="w-[760px]">
          {kpiCharts.length > 0 && (
            <div
              className="break-inside-avoid"
              style={{ breakAfter: otherCharts.length > 0 ? 'page' : 'auto' }}
            >
              <div className="grid grid-cols-2 gap-4">
                {kpiCharts.map((chart, i) => (
                  <div key={chart.id} className="h-40">
                    <DashboardTile chart={chart} slotIndex={i} filters={filters} onPointClick={onPointClick} />
                  </div>
                ))}
              </div>
              {keyFindings.length > 0 && (
                <div className="mt-6">
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Key Findings
                  </div>
                  <ul className="space-y-2">
                    {keyFindings.map((f, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-600">
                        <span className="text-slate-400">•</span>
                        <span>
                          <span className="font-medium text-slate-700">{f.title}:</span> {f.description}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {otherCharts.map((chart, i) => (
            <div
              key={chart.id}
              className="break-inside-avoid"
              style={{ breakAfter: i === otherCharts.length - 1 ? 'auto' : 'page' }}
            >
              <DashboardTile chart={chart} slotIndex={i} filters={filters} onPointClick={onPointClick} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
