import { Coins, Hash, Percent, TrendingUp } from 'lucide-react'
import { scaleLinear } from 'd3-scale'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  Scatter,
  ScatterChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { STATUS, useChartPalette } from '../../lib/palette'
import { formatValue, humanizeFieldName } from '../../lib/format'
import { normalizeCountryName } from '../../lib/countryNames'
import type { ChartSpec, DashboardFilter, QueryResultData } from '../../types'
import { KpiCard } from './KpiCard'
import { ResultTable } from './ResultTable'

// world-atlas's pre-built TopoJSON at 110m resolution — light enough to fetch on demand
// (~100KB) without bundling a geo file into the app, and the standard source used by nearly
// every react-simple-maps example for a world choropleth.
const WORLD_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

const KPI_ICONS = [Coins, Hash, TrendingUp, Percent]
const MAX_CHART_ITEMS = 12
// Above this many points, per-point dot markers just turn a line/area into a smear of
// circles (as seen on a dense minute-by-minute trend) — drop them and let the line speak.
const DOT_SUPPRESS_THRESHOLD = 40

function topN(rows: Record<string, unknown>[], yField: string, n: number) {
  const sorted = [...rows].sort((a, b) => Number(b[yField] ?? 0) - Number(a[yField] ?? 0))
  return { items: sorted.slice(0, n), truncated: sorted.length > n, total: sorted.length }
}

function TruncationNote({ truncated, total, n }: { truncated: boolean; total: number; n: number }) {
  if (!truncated) return null
  return (
    <p className="px-4 pb-3 text-xs text-slate-400">
      Showing top {n} of {total} — see the full breakdown in the table below.
    </p>
  )
}

/** ANDs every active dashboard filter that applies to this chart's own columns — a filter
 * on a field this chart doesn't have is silently ignored rather than blanking the chart. */
function applyFilters(rows: Record<string, unknown>[], filters?: DashboardFilter[]) {
  if (!filters || filters.length === 0 || rows.length === 0) return rows
  const applicable = filters.filter((f) => f.field in rows[0])
  if (applicable.length === 0) return rows
  return rows.filter((r) => applicable.every((f) => String(r[f.field]) === String(f.value)))
}

/** Recharts hands the clicked bar's own data point back as `entry.payload` (or, for a plain
 * un-nested Bar, as the entry itself) — either way this pulls the x-axis value out of it. */
function pointXValue(entry: unknown, xField: string): unknown {
  const e = entry as { payload?: Record<string, unknown> } & Record<string, unknown>
  return e?.payload ? e.payload[xField] : e?.[xField]
}

function groupBySeries(rows: Record<string, unknown>[], xField: string, seriesField: string, yField: string) {
  const seriesNames = Array.from(new Set(rows.map((r) => String(r[seriesField]))))
  const xValues = Array.from(new Set(rows.map((r) => String(r[xField]))))
  return xValues.map((x) => {
    const point: Record<string, unknown> = { [xField]: x }
    for (const s of seriesNames) {
      const match = rows.find((r) => String(r[xField]) === x && String(r[seriesField]) === s)
      point[s] = match ? match[yField] : null
    }
    return point
  }).map((point) => ({ point, seriesNames }))
}

function histogramBins(rows: Record<string, unknown>[], field: string, binCount = 12) {
  const values = rows.map((r) => Number(r[field])).filter((v) => Number.isFinite(v))
  if (values.length === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const width = (max - min) / binCount || 1
  const bins = Array.from({ length: binCount }, (_, i) => ({
    label: `${formatValue(min + i * width)}–${formatValue(min + (i + 1) * width)}`,
    count: 0,
  }))
  for (const v of values) {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((v - min) / width)))
    bins[idx].count++
  }
  return bins
}

export function ChartRenderer({
  spec,
  result,
  height = 280,
  maxItems = MAX_CHART_ITEMS,
  color,
  activeFilters,
  onPointClick,
}: {
  spec: ChartSpec
  result: QueryResultData
  height?: number
  maxItems?: number
  /** User-chosen color override (from a "change the color" chat instruction) — replaces
   * the primary/first-series color only; additional series keep the validated palette. */
  color?: string
  /** The dashboard's active cross-filters (set by clicking a bar/slice elsewhere) — each is
   * applied here only if this chart's rows happen to have that column; the rest are ANDed. */
  activeFilters?: DashboardFilter[]
  /** Called with (field, value) when the user clicks a bar, to toggle a dashboard filter. */
  onPointClick?: (field: string, value: unknown) => void
}) {
  const palette = useChartPalette()
  const ink = palette.ink
  const sequentialBlue = color ?? palette.sequentialBlue
  const categorical = color ? [color, ...palette.categorical.slice(1)] : palette.categorical
  const filteredRows = applyFilters(result.rows, activeFilters)

  if (filteredRows.length === 0) {
    const applicable = (activeFilters ?? []).filter((f) => result.rows.length === 0 || f.field in (result.rows[0] ?? {}))
    return (
      <div className="p-8 text-center text-sm text-slate-400">
        {applicable.length > 0 && result.rows.length > 0
          ? `No rows match ${applicable.map((f) => `${humanizeFieldName(f.field)} = ${String(f.value)}`).join(' and ')}.`
          : 'No data returned for this query.'}
      </div>
    )
  }

  if (spec.chart_type === 'kpi') {
    const fields = spec.y_fields.length > 0 ? spec.y_fields : result.columns.map((c) => c.name)
    return (
      <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        {fields.map((field, i) => (
          <KpiCard key={field} field={field} value={result.rows[0]?.[field]} icon={KPI_ICONS[i % KPI_ICONS.length]} slot={i} />
        ))}
      </div>
    )
  }

  if (spec.chart_type === 'text') {
    const field = spec.y_fields[0] ?? result.columns[0]?.name
    const content = field ? String(filteredRows[0]?.[field] ?? '') : ''
    return (
      <div className="whitespace-pre-wrap p-4 text-sm leading-relaxed" style={{ color: ink.secondary }}>
        {content || 'No content.'}
      </div>
    )
  }

  if (spec.chart_type === 'gauge') {
    // Expects one row with a value column (y_fields[0]) and, optionally, a max/capacity
    // column (y_fields[1]) — e.g. "developed lots" out of "total lots planned". Falls back
    // to a nominal max of value*1.5 so the gauge still renders sensibly with just one field.
    const valueField = spec.y_fields[0]
    const maxField = spec.y_fields[1]
    const row = filteredRows[0] ?? {}
    const value = Number(row[valueField] ?? 0)
    const max = maxField && row[maxField] != null ? Number(row[maxField]) : value * 1.5 || 1
    const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
    const data = [{ name: 'value', value: pct }]
    return (
      <div className="flex flex-col items-center justify-center px-4 pb-4 pt-2" style={{ height }}>
        <ResponsiveContainer width="100%" height="70%">
          <RadialBarChart
            cx="50%" cy="95%" innerRadius="75%" outerRadius="100%"
            barSize={16} data={data} startAngle={180} endAngle={0}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={8} background={{ fill: ink.grid }} fill={sequentialBlue} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="-mt-6 flex flex-col items-center">
          <span className="text-2xl font-semibold" style={{ color: ink.primary }}>
            {formatValue(value)}
          </span>
        </div>
        <div className="mt-1 flex w-full max-w-[220px] justify-between text-xs" style={{ color: ink.muted }}>
          <span>{formatValue(0)}</span>
          <span>{formatValue(max)}</span>
        </div>
      </div>
    )
  }

  if (spec.chart_type === 'table' || !spec.x_field || spec.y_fields.length === 0) {
    return <ResultTable result={{ ...result, rows: filteredRows, row_count: filteredRows.length }} />
  }

  const xField = spec.x_field
  const yField = spec.y_fields[0]

  if (spec.chart_type === 'map') {
    const byCountry = new Map<string, number>()
    for (const r of filteredRows) {
      const name = normalizeCountryName(String(r[xField] ?? ''))
      const value = Number(r[yField])
      if (name && Number.isFinite(value)) byCountry.set(name, value)
    }
    const values = Array.from(byCountry.values())
    const min = values.length ? Math.min(...values) : 0
    const max = values.length ? Math.max(...values) : 1
    const colorScale = scaleLinear<string>()
      .domain([min, max])
      .range(['#dbeafe', sequentialBlue])
    return (
      <div style={{ height }}>
        <ComposableMap projectionConfig={{ scale: 140 }} style={{ width: '100%', height: '100%' }}>
          <Geographies geography={WORLD_ATLAS_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const name = String((geo.properties as { name?: string }).name ?? '')
                const value = byCountry.get(name)
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => value !== undefined && onPointClick?.(xField, name)}
                    style={{
                      fill: value !== undefined ? colorScale(value) : ink.grid,
                      stroke: ink.axis,
                      strokeWidth: 0.4,
                      outline: 'none',
                      cursor: value !== undefined && onPointClick ? 'pointer' : 'default',
                    }}
                  >
                    <title>{value !== undefined ? `${name}: ${formatValue(value)}` : name}</title>
                  </Geography>
                )
              })
            }
          </Geographies>
        </ComposableMap>
        {values.length === 0 && (
          <p className="px-4 pb-3 text-center text-xs text-slate-400">
            No values in this data matched a recognized country name.
          </p>
        )}
      </div>
    )
  }

  if (spec.chart_type === 'pie') {
    const { items, truncated, total } = topN(filteredRows, yField, maxItems)
    const data = items.map((r) => ({ name: String(r[xField]), value: Number(r[yField]) }))
    // Percentage-based radii scale down with a narrow tile instead of overflowing it, and a
    // wrapping legend below the chart (rather than a fixed-width column on the right) can't
    // collide with the donut the way a side legend does once the tile is narrower than both
    // combined need — this was rendering as a broken overlapping mess in compact tiles.
    return (
      <div>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart margin={{ bottom: 24 }}>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="46%" innerRadius="45%" outerRadius="70%" paddingAngle={2}>
              {data.map((_, i) => (
                <Cell key={i} fill={categorical[i % categorical.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip formatter={(v) => formatValue(v)} />
            <Legend verticalAlign="bottom" align="center" layout="horizontal" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <TruncationNote truncated={truncated} total={total} n={maxItems} />
      </div>
    )
  }

  if (spec.chart_type === 'funnel') {
    // Rows come pre-ordered by the query (stage sequence) — no re-sorting here, since a
    // funnel's whole point is showing the sequence, not ranking by size.
    const data = filteredRows.map((r) => ({ name: String(r[xField]), value: Number(r[yField]) }))
    return (
      <ResponsiveContainer width="100%" height={height}>
        <FunnelChart>
          <Tooltip formatter={(v) => formatValue(v)} />
          <Funnel dataKey="value" data={data} isAnimationActive={false}>
            <LabelList position="right" dataKey="name" fill={ink.secondary} stroke="none" fontSize={12} />
            <LabelList position="center" dataKey="value" fill="#fff" stroke="none" fontSize={12} formatter={(v) => formatValue(Number(v))} />
            {data.map((_, i) => (
              <Cell key={i} fill={categorical[i % categorical.length]} />
            ))}
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    )
  }

  if (spec.chart_type === 'waterfall') {
    // Each row is a signed delta (e.g. +revenue, -costs) applied in sequence to a running
    // total — rendered as a stacked bar with an invisible "base" segment holding the bar off
    // the axis by the running total so far, and a visible "delta" segment on top of it.
    let running = 0
    const data = filteredRows.map((r) => {
      const delta = Number(r[yField] ?? 0)
      const base = delta >= 0 ? running : running + delta
      running += delta
      return { name: String(r[xField]), base, delta: Math.abs(delta), isPositive: delta >= 0, end: running }
    })
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          <CartesianGrid vertical={false} stroke={ink.grid} />
          <XAxis dataKey="name" tick={{ fill: ink.muted, fontSize: 12 }} axisLine={{ stroke: ink.axis }} tickLine={false} />
          <YAxis tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(_v, name, entry) =>
              name === 'delta' ? [formatValue(entry.payload.end), 'Running total'] : [null, null]
            }
          />
          <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="delta" stackId="waterfall" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.isPositive ? STATUS.good : STATUS.critical} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (spec.chart_type === 'scatter') {
    const data = filteredRows.map((r) => ({ x: Number(r[xField]), y: Number(r[yField]) }))
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart>
          <CartesianGrid stroke={ink.grid} />
          <XAxis
            dataKey="x" type="number" name={humanizeFieldName(xField)}
            tick={{ fill: ink.muted, fontSize: 12 }} axisLine={{ stroke: ink.axis }} tickLine={false}
          />
          <YAxis
            dataKey="y" type="number" name={humanizeFieldName(yField)}
            tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false}
          />
          <Tooltip formatter={(v) => formatValue(v)} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={data} fill={sequentialBlue} fillOpacity={0.7} />
        </ScatterChart>
      </ResponsiveContainer>
    )
  }

  if (spec.chart_type === 'histogram') {
    const bins = histogramBins(filteredRows, yField)
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={bins}>
          <CartesianGrid vertical={false} stroke={ink.grid} />
          <XAxis dataKey="label" tick={{ fill: ink.muted, fontSize: 11 }} axisLine={{ stroke: ink.axis }} tickLine={false} />
          <YAxis tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v) => [`${v}`, 'Count']} />
          <Bar dataKey="count" fill={sequentialBlue} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (spec.series_field) {
    const grouped = groupBySeries(filteredRows, xField, spec.series_field, yField)
    const data = grouped.map((g) => g.point)
    const seriesNames = grouped[0]?.seriesNames ?? []
    const showDots = data.length <= DOT_SUPPRESS_THRESHOLD

    if (spec.chart_type === 'bar' || spec.chart_type === 'stacked_bar') {
      const stacked = spec.chart_type === 'stacked_bar'
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data}>
            <CartesianGrid vertical={false} stroke={ink.grid} />
            <XAxis dataKey={xField} tick={{ fill: ink.muted, fontSize: 12 }} axisLine={{ stroke: ink.axis }} tickLine={false} />
            <YAxis tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => formatValue(v)} />
            <Legend iconType="circle" />
            {seriesNames.map((name, i) => (
              <Bar
                key={name} dataKey={name} fill={categorical[i % categorical.length]}
                stackId={stacked ? 'stack' : undefined} radius={stacked ? undefined : [4, 4, 0, 0]}
                onClick={(entry) => onPointClick?.(xField, pointXValue(entry, xField))}
                style={onPointClick ? { cursor: 'pointer' } : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )
    }

    if (spec.chart_type === 'area') {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data}>
            <CartesianGrid vertical={false} stroke={ink.grid} />
            <XAxis dataKey={xField} tick={{ fill: ink.muted, fontSize: 12 }} axisLine={{ stroke: ink.axis }} tickLine={false} />
            <YAxis tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => formatValue(v)} />
            <Legend iconType="circle" />
            {seriesNames.map((name, i) => (
              <Area
                key={name} type="monotone" dataKey={name} stackId="stack"
                stroke={categorical[i % categorical.length]} fill={categorical[i % categorical.length]}
                fillOpacity={0.3} dot={showDots ? { r: 3 } : false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )
    }

    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid vertical={false} stroke={ink.grid} />
          <XAxis dataKey={xField} tick={{ fill: ink.muted, fontSize: 12 }} axisLine={{ stroke: ink.axis }} tickLine={false} />
          <YAxis tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v) => formatValue(v)} />
          <Legend iconType="circle" />
          {seriesNames.map((name, i) => (
            <Line
              key={name} type="monotone" dataKey={name} stroke={categorical[i % categorical.length]}
              strokeWidth={2} dot={showDots ? { r: 3 } : false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  const data = filteredRows.map((r) => ({ ...r }))
  const showDots = data.length <= DOT_SUPPRESS_THRESHOLD

  if (spec.chart_type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid vertical={false} stroke={ink.grid} />
          <XAxis dataKey={xField} tick={{ fill: ink.muted, fontSize: 12 }} axisLine={{ stroke: ink.axis }} tickLine={false} />
          <YAxis tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v) => formatValue(v)} labelFormatter={(l) => humanizeFieldName(String(l))} />
          <Line type="monotone" dataKey={yField} stroke={sequentialBlue} strokeWidth={2} dot={showDots ? { r: 3 } : false} />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  if (spec.chart_type === 'area') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data}>
          <CartesianGrid vertical={false} stroke={ink.grid} />
          <XAxis dataKey={xField} tick={{ fill: ink.muted, fontSize: 12 }} axisLine={{ stroke: ink.axis }} tickLine={false} />
          <YAxis tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v) => formatValue(v)} labelFormatter={(l) => humanizeFieldName(String(l))} />
          <Area type="monotone" dataKey={yField} stroke={sequentialBlue} fill={sequentialBlue} fillOpacity={0.25} dot={showDots ? { r: 3 } : false} />
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  const { items: barItems, truncated: barTruncated, total: barTotal } = topN(data, yField, maxItems)

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={barItems}>
          <CartesianGrid vertical={false} stroke={ink.grid} />
          <XAxis dataKey={xField} tick={{ fill: ink.muted, fontSize: 12 }} axisLine={{ stroke: ink.axis }} tickLine={false} />
          <YAxis tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v) => formatValue(v)} labelFormatter={(l) => humanizeFieldName(String(l))} />
          <Bar
            dataKey={yField} fill={sequentialBlue} radius={[4, 4, 0, 0]}
            onClick={(entry) => onPointClick?.(xField, pointXValue(entry, xField))}
            style={onPointClick ? { cursor: 'pointer' } : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
      <TruncationNote truncated={barTruncated} total={barTotal} n={maxItems} />
    </div>
  )
}
