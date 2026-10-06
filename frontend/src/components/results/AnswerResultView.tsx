import { Maximize2, Radio, Scan, Table2, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ChartRenderer } from './ChartRenderer'
import { InsightsPopover } from './InsightsPopover'
import { SqlPopover } from './SqlPopover'
import { ResultTable } from './ResultTable'
import { WhatIfPopover } from './WhatIfPopover'
import type { DashboardFilter, QueryAnswer } from '../../types'

function SingleAnswer({
  answer,
  title,
  onDelete,
  color,
  activeFilters,
  onPointClick,
  height,
  sourceId,
  live,
  onToggleLive,
}: {
  answer: QueryAnswer
  title?: string
  onDelete?: () => void
  color?: string
  activeFilters?: DashboardFilter[]
  onPointClick?: (field: string, value: unknown) => void
  /** Overrides the inline (non-expanded) chart height — e.g. to match a dashboard tile's
   * actual allotted space instead of the chart's own hardcoded default. */
  height?: number
  /** Present only for a pinned dashboard chart — enables what-if analysis (re-runs this
   * source's SQL directly) and the live-refresh toggle, neither of which make sense for a
   * transient chat/analyst-page result that isn't backed by a saved chart. */
  sourceId?: string
  live?: boolean
  onToggleLive?: () => void
}) {
  const [showTableModal, setShowTableModal] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const zoomAreaRef = useRef<HTMLDivElement>(null)
  const [previewAnswer, setPreviewAnswer] = useState<QueryAnswer | null>(null)
  const displayedAnswer = previewAnswer ?? answer
  useEffect(() => {
    setPreviewAnswer(null)
  }, [answer.sql])
  const isTableChart = answer.chart_spec.chart_type === 'table'
  const canExpand = !['table', 'kpi', 'text'].includes(answer.chart_spec.chart_type)
  // Dense x-axis charts (a long trend line, many bars, a big scatter) turn into an
  // unreadable smear when squeezed into a fixed-width modal — give them real breathing
  // room by width instead, and let the container scroll horizontally to reach the rest.
  const isDense = ['line', 'area', 'bar', 'stacked_bar', 'scatter', 'histogram'].includes(answer.chart_spec.chart_type)
  // A histogram always renders a fixed ~12 bins regardless of how many raw rows fed it, so
  // it shouldn't inherit the raw row count for sizing.
  const densePointCount = answer.chart_spec.chart_type === 'histogram' ? 12 : answer.result.row_count
  const baseExpandedWidthPx = isDense ? Math.max(800, densePointCount * 8) : 800
  const baseExpandedHeightPx = 560
  const zoomedWidthPx = Math.round(baseExpandedWidthPx * zoom)
  const zoomedHeightPx = Math.round(baseExpandedHeightPx * zoom)

  function fitToView() {
    const el = zoomAreaRef.current
    if (!el) return
    // Fit both dimensions, not just width — scaling by width alone and applying that same
    // factor to height let a chart with few data points (small base width) zoom "up" to fill
    // the modal's width, which blew the height up by the same factor and forced a vertical
    // scroll with oversized bars instead of a clean, fully-visible chart.
    const availableWidth = el.clientWidth - 40 // account for the p-5 padding on both sides
    const availableHeight = el.clientHeight - 40
    const widthRatio = availableWidth / baseExpandedWidthPx
    const heightRatio = availableHeight / baseExpandedHeightPx
    setZoom(Math.max(0.1, Math.min(3, Math.min(widthRatio, heightRatio))))
  }

  useEffect(() => {
    if (!expanded) return
    // Default to a fitted view that shows the whole chart with no horizontal scrolling.
    fitToView()
    const el = zoomAreaRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      setZoom((z) => Math.max(0.1, Math.min(3, z + (e.deltaY < 0 ? 0.1 : -0.1))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {title || answer.chart_spec.title || answer.objective}
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          <SqlPopover sql={displayedAnswer.sql} />
          <InsightsPopover answer={answer} />
          {sourceId && <WhatIfPopover sourceId={sourceId} answer={answer} onPreview={setPreviewAnswer} />}
          {onToggleLive && (
            <button
              onClick={onToggleLive}
              title={live ? 'Live — refreshing automatically. Click to stop.' : 'Turn on live auto-refresh'}
              className={`rounded-lg border p-1.5 ${
                live
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'border-slate-200 bg-white text-slate-400 hover:text-brand-600 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-500'
              }`}
            >
              <Radio className={`h-3.5 w-3.5 ${live ? 'animate-pulse' : ''}`} />
            </button>
          )}
          {!isTableChart && (
            <button
              onClick={() => setShowTableModal(true)}
              title={`View raw data (${displayedAnswer.result.row_count} rows)`}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:text-brand-600 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-500"
            >
              <Table2 className="h-3.5 w-3.5" />
            </button>
          )}
          {canExpand && (
            <button
              onClick={() => setExpanded(true)}
              title="View full chart"
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:text-brand-600 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-500"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              title="Remove from dashboard"
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:border-rose-200 hover:text-rose-500 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-navy-700 dark:bg-navy-900">
        <ChartRenderer
          spec={displayedAnswer.chart_spec}
          result={displayedAnswer.result}
          color={color}
          activeFilters={activeFilters}
          onPointClick={onPointClick}
          height={height}
        />
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setExpanded(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-navy-800"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-navy-700">
              <h2 className="text-base font-semibold text-slate-800 dark:text-white">
                {answer.chart_spec.title || answer.objective}
              </h2>
              <div className="flex items-center gap-3">
                {isDense && (
                  <button
                    onClick={fitToView}
                    title="Fit the whole chart in view, no scrolling needed"
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-navy-700 dark:text-slate-300 dark:hover:bg-navy-900"
                  >
                    <Scan className="h-3.5 w-3.5" />
                    Fit view
                  </button>
                )}
                <button onClick={() => setExpanded(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div ref={zoomAreaRef} className="scrollbar-thin flex-1 overflow-auto p-5">
              <div style={isDense || zoom !== 1 ? { width: `${zoomedWidthPx}px` } : undefined}>
                <ChartRenderer
                  spec={displayedAnswer.chart_spec}
                  result={displayedAnswer.result}
                  height={zoomedHeightPx}
                  maxItems={60}
                  color={color}
                  activeFilters={activeFilters}
                  onPointClick={onPointClick}
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {isDense && `Showing all ${displayedAnswer.result.row_count} data points. `}
                Scroll up/down with two fingers to zoom ({Math.round(zoom * 100)}%) — use Fit view to see everything again.
              </p>
            </div>
          </div>
        </div>
      )}

      {showTableModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setShowTableModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-navy-800"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-navy-700">
              <h2 className="text-base font-semibold text-slate-800 dark:text-white">
                Raw data ({displayedAnswer.result.row_count} row{displayedAnswer.result.row_count === 1 ? '' : 's'})
              </h2>
              <button onClick={() => setShowTableModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="scrollbar-thin flex-1 overflow-auto">
              <ResultTable result={displayedAnswer.result} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function AnswerResultView({
  answer,
  title,
  onDelete,
  color,
  activeFilters,
  onPointClick,
  height,
  sourceId,
  live,
  onToggleLive,
}: {
  answer: QueryAnswer
  title?: string
  onDelete?: () => void
  color?: string
  activeFilters?: DashboardFilter[]
  onPointClick?: (field: string, value: unknown) => void
  height?: number
  sourceId?: string
  live?: boolean
  onToggleLive?: () => void
}) {
  const extras = answer.extra_answers ?? []

  return (
    <div className="space-y-6">
      <SingleAnswer
        answer={answer}
        title={title}
        onDelete={onDelete}
        sourceId={sourceId}
        live={live}
        onToggleLive={onToggleLive}
        color={color}
        activeFilters={activeFilters}
        onPointClick={onPointClick}
        height={height}
      />

      {extras.length > 0 && (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            That question asked about several things at once, so it was split into {extras.length + 1}{' '}
            separate charts:
          </p>
          {extras.map((extra, i) => (
            <SingleAnswer key={i} answer={extra} activeFilters={activeFilters} onPointClick={onPointClick} />
          ))}
        </>
      )}
    </div>
  )
}
