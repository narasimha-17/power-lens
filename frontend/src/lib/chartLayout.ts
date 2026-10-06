import type { ChartType, PinnedChart, TileSize } from '../types'

// A compact stat/gauge/text tile stays small by default; a breakdown or comparison chart
// gets more room since it needs to show several categories legibly; a table gets the most
// room. Only a *default* — the user can resize any tile afterward.
const DEFAULT_SIZE_BY_CHART_TYPE: Record<ChartType, TileSize> = {
  kpi: 'sm',
  gauge: 'sm',
  text: 'sm',
  pie: 'lg',
  treemap: 'lg',
  scatter: 'lg',
  histogram: 'lg',
  bar: 'lg',
  stacked_bar: 'lg',
  line: 'lg',
  area: 'lg',
  funnel: 'lg',
  waterfall: 'lg',
  table: 'xl',
  map: 'xl',
}

export function defaultSizeForChartType(chartType: ChartType): TileSize {
  return DEFAULT_SIZE_BY_CHART_TYPE[chartType] ?? 'lg'
}

// Base grid is 6 columns (at the lg breakpoint) — a compact stat-card pair is 2 of them, a
// standard chart is 3, and a table is the full 6. That makes two standard charts add up to
// exactly 6, so they sit side by side by default, while a stat-card pair (2) next to one
// chart (3+1 stretched) still fills the row with nothing left over either way.
export const TILE_SIZE_CLASSES: Record<TileSize, string> = {
  sm: 'sm:col-span-1 lg:col-span-2 lg:row-span-1',
  md: 'sm:col-span-1 lg:col-span-2 lg:row-span-2',
  // A real chart (bar/pie/line/...) needs two grid rows of vertical room to render its
  // legend/axes without being clipped or scrolling — a single 240px row is only enough
  // for a compact kpi/gauge/text tile.
  lg: 'sm:col-span-2 lg:col-span-3 lg:row-span-2',
  xl: 'sm:col-span-2 lg:col-span-6 lg:row-span-2',
}

// Pixel height to give the chart itself (inside the tile's title bar + padding) so it fills
// its tile exactly instead of overflowing (and getting clipped) or leaving dead space.
export const TILE_SIZE_CHART_HEIGHT: Record<TileSize, number> = {
  sm: 160,
  md: 380,
  lg: 380,
  xl: 380,
}

export const TILE_SIZE_LABELS: Record<TileSize, string> = {
  sm: 'S',
  md: 'M',
  lg: 'L',
  xl: 'XL',
}

export const TILE_SIZE_ORDER: TileSize[] = ['sm', 'md', 'lg', 'xl']

const GRID_WIDTH = 6

// Column-span classes for a planned grid slot, keyed by span width 1-6 — these class name
// tokens already appear as literal strings somewhere in this file or elsewhere in the app
// (col-span-1 through col-span-6 are all standard Tailwind utilities), so picking one
// dynamically at render time is safe; Tailwind's scanner includes the whole default scale.
const COL_SPAN_CLASSES: Record<number, string> = {
  1: 'sm:col-span-1 lg:col-span-1',
  2: 'sm:col-span-2 lg:col-span-2',
  3: 'sm:col-span-2 lg:col-span-3',
  4: 'sm:col-span-2 lg:col-span-4',
  5: 'sm:col-span-2 lg:col-span-5',
  6: 'sm:col-span-2 lg:col-span-6',
}
const ROW_SPAN_CLASSES: Record<1 | 2, string> = {
  1: 'lg:row-span-1',
  2: 'lg:row-span-2',
}

export interface DashboardGridSlot {
  charts: PinnedChart[]
  colSpan: number
  rowSpan: 1 | 2
  className: string
}

/** Packs pinned charts into rows of a 6-column grid (2=stat-card pair, 3=standard chart,
 * 6=table/full width — so two standard charts add up to exactly 6 and sit side by side by
 * default), then stretches the last tile in any row that doesn't already add up to 6 so it
 * fills the remaining width — a lone chart with nothing left to pair it with would otherwise
 * leave empty space next to it, which `grid-auto-flow: dense` alone can't fix since nothing
 * else is sized to fill that gap. */
export function planDashboardGrid(charts: PinnedChart[]): DashboardGridSlot[] {
  type Item = { charts: PinnedChart[]; width: number; rowSpan: 1 | 2 }
  const items: Item[] = []
  for (let i = 0; i < charts.length; i++) {
    const chart = charts[i]
    const size = defaultSizeForChartType(chart.answer.chart_spec.chart_type)
    if (size === 'sm') {
      // Bundle every consecutive run of compact tiles (kpi/gauge/text) into one stacked
      // column, not just pairs — 3 or 4 headline stat cards in a row is the normal case for
      // a real overview dashboard, and stopping at 2 left the 3rd+ card as a lone row-span-1
      // tile sitting next to a much taller chart, with dead space below it.
      const run = [chart]
      while (
        i + 1 < charts.length &&
        defaultSizeForChartType(charts[i + 1].answer.chart_spec.chart_type) === 'sm'
      ) {
        i++
        run.push(charts[i])
      }
      items.push({ charts: run, width: 2, rowSpan: run.length > 1 ? 2 : 1 })
      continue
    }
    items.push({ charts: [chart], width: size === 'xl' ? 6 : 3, rowSpan: 2 })
  }

  const rows: Item[][] = []
  let currentRow: Item[] = []
  let rowWidth = 0
  for (const item of items) {
    if (rowWidth + item.width > GRID_WIDTH && currentRow.length > 0) {
      rows.push(currentRow)
      currentRow = []
      rowWidth = 0
    }
    currentRow.push(item)
    rowWidth += item.width
  }
  if (currentRow.length > 0) rows.push(currentRow)

  const slots: DashboardGridSlot[] = []
  for (const row of rows) {
    const total = row.reduce((sum, item) => sum + item.width, 0)
    const leftover = Math.max(0, GRID_WIDTH - total)
    row.forEach((item, idx) => {
      const colSpan = idx === row.length - 1 ? item.width + leftover : item.width
      slots.push({
        charts: item.charts,
        colSpan,
        rowSpan: item.rowSpan,
        className: `${COL_SPAN_CLASSES[colSpan]} ${ROW_SPAN_CLASSES[item.rowSpan]}`,
      })
    })
  }
  return slots
}
