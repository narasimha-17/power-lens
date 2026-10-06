export type ColumnKind = 'numeric' | 'datetime' | 'categorical' | 'text'
export type ChartType =
  | 'bar'
  | 'stacked_bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'scatter'
  | 'histogram'
  | 'treemap'
  | 'kpi'
  | 'table'
  | 'gauge'
  | 'text'
  | 'funnel'
  | 'waterfall'
  | 'map'
export type SourceType = 'file' | 'sql' | 'live'
/** Mosaic tile size on a dashboard grid — see DashboardDetailPage's grid for how each maps
 * to a column/row span. Purely a display hint. */
export type TileSize = 'sm' | 'md' | 'lg' | 'xl'

export interface ColumnInfo {
  name: string
  type: ColumnKind
  raw_type: string
}

export interface TableInfo {
  name: string
  columns: ColumnInfo[]
  row_count_estimate: number | null
}

export interface SchemaInfo {
  tables: TableInfo[]
  dialect: string
}

export interface QueryResultData {
  columns: ColumnInfo[]
  rows: Record<string, unknown>[]
  row_count: number
  truncated: boolean
  execution_ms: number
}

export interface ChartSpec {
  chart_type: ChartType
  x_field: string | null
  y_fields: string[]
  series_field: string | null
  title: string
}

/** A dashboard-level cross-filter set by clicking a bar in one chart — applied client-side
 * to any other chart whose result rows happen to share the same column. */
export interface DashboardFilter {
  field: string
  value: unknown
}


export interface SourceInfo {
  id: string
  source_type: SourceType
  name: string
  status: string
  last_refreshed: string | null
  refresh_interval_s: number | null
}

export interface SqlConnectionRequest {
  dialect: 'postgresql' | 'mysql'
  host: string
  port: number
  database: string
  user: string
  password: string
  display_name: string
  tables?: string[] | null
}

/** A remembered SQL connection profile — everything except the password, which is never
 * persisted. Used to prefill the connect form so reconnecting after a backend restart is a
 * couple of clicks plus the password. */
export interface RecentSqlConnection {
  id: string
  dialect: 'postgresql' | 'mysql'
  host: string
  port: number
  database: string
  user: string
  display_name: string
  last_connected_at: string
}

export interface UrlConnectionRequest {
  url: string
  display_name: string
  format?: 'csv' | 'parquet' | 'json' | null
  s3_access_key?: string | null
  s3_secret_key?: string | null
  s3_region?: string | null
}

export interface ApiConnectionRequest {
  url: string
  display_name: string
  headers?: Record<string, string>
  records_path?: string | null
}

export interface QueryAnswer {
  objective: string
  sql: string
  chart_spec: ChartSpec
  result: QueryResultData
  execution_ms: number
  extra_answers?: QueryAnswer[]
}

export interface QueryHistoryEntry {
  id: string
  sourceId: string
  sourceName: string
  question: string
  askedAt: string
  answer?: QueryAnswer
  error?: string
}

export interface PinnedChart {
  id: string
  question: string
  sourceId: string
  sourceName: string
  answer: QueryAnswer
  pinnedAt: string
  /** User-chosen override for the chart's primary color (chat "change the color" requests
   * are a pure styling ask — handled client-side, never sent to the LLM/SQL pipeline). */
  color?: string
  /** Mosaic tile size on the dashboard grid; falls back to a chart-type-based default when
   * unset (see lib/chartLayout.ts). */
  size?: TileSize
  /** Short-interval client-side polling (re-runs this chart's own SQL directly, bypassing
   * the LLM, every few seconds) — distinct from the LLM-driven scheduled refresh/alerts
   * feature, which re-asks the question on a much longer interval. */
  live?: boolean
}

/** A user-defined join key between two tables on the same source — surfaced to the NL→SQL
 * pipeline so it doesn't have to guess a join column from naming conventions alone. */
export interface TableRelationship {
  id: string
  sourceId: string
  tableA: string
  columnA: string
  tableB: string
  columnB: string
  createdAt: string
}

export interface Dashboard {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  charts: PinnedChart[]
  isFavorite: boolean
}

export interface OverviewKpi {
  field: string
  label: string
  total: number | null
  average: number | null
  count: number
  delta_pct: number | null
}

export interface TrendPoint {
  bucket: string
  value: number | null
}

export interface OverviewTrend {
  date_field: string
  value_field: string
  points: TrendPoint[]
}

export interface BreakdownItem {
  category: string
  value: number | null
  delta_pct: number | null
}

export interface OverviewBreakdown {
  category_field: string
  value_field: string
  items: BreakdownItem[]
}

export interface OverviewFilters {
  categorical_columns: string[]
  datetime_columns: string[]
  category_values: string[]
  available_years: number[]
}

export interface OverviewInsight {
  tone: 'good' | 'warning' | 'critical'
  title: string
  description: string
}

export interface AgentStep {
  question: string
  status: 'ok' | 'failed'
  answer: QueryAnswer | null
  error: string | null
}

export interface AutoDashboardResult {
  dashboard_name: string
  steps: AgentStep[]
}

export interface DashboardJobStatus {
  job_id: string
  status: 'running' | 'done' | 'error'
  result: AutoDashboardResult | null
  error: string | null
}

export interface OverviewResponse {
  table: string
  record_count: number
  kpis: OverviewKpi[]
  trend: OverviewTrend | null
  breakdown: OverviewBreakdown | null
  filters: OverviewFilters
  insights: OverviewInsight[]
}

export interface ForecastPoint {
  bucket: string
  value: number | null
  is_forecast: boolean
}

export interface ForecastResponse {
  date_field: string
  value_field: string
  numeric_fields: string[]
  method: string
  periods_history: number
  periods_forecast: number
  points: ForecastPoint[]
}

export type MetricType = 'revenue' | 'cost' | 'profit' | 'quantity' | 'target' | 'price' | 'generic_numeric'
export type DimensionType = 'product' | 'category' | 'region' | 'customer' | 'employee' | 'segment' | 'generic_categorical'
export type QuestionPriority = 'Critical' | 'High' | 'Medium' | 'Low'
export type SignalSeverity = 'low' | 'medium' | 'high'

export interface BiMetric {
  name: string
  column: string
  metric_type: MetricType
  aggregation: 'SUM' | 'AVG' | 'COUNT'
}

export interface BiDimension {
  name: string
  column: string
  dimension_type: DimensionType
  distinct_count: number
}

export interface BiTimeDimension {
  name: string
  column: string
  min_date: string | null
  max_date: string | null
  spans_multiple_years: boolean
}

export interface BiSemanticLayer {
  metrics: BiMetric[]
  dimensions: BiDimension[]
  time_dimensions: BiTimeDimension[]
}

export interface BiSignal {
  type: string
  description: string
  severity: SignalSeverity
  related_fields: string[]
}

export interface BiRecommendedQuestion {
  id: string
  question: string
  category: string
  analysis_type: string
  persona: string
  priority: QuestionPriority
  score: number
  required_fields: string[]
  why_it_matters: string
}

export interface BiDatasetSummary {
  domain: string
  confidence: number
  rows: number
  columns: number
  secondary_domains: string[]
}

export interface BiBusinessContext {
  primary_use_case: string
  available_areas: string[]
}

export interface BiAnalysisResult {
  dataset_summary: BiDatasetSummary
  business_context: BiBusinessContext
  semantic_layer: BiSemanticLayer
  signals: BiSignal[]
  recommended_questions: BiRecommendedQuestion[]
  data_quality_warnings: string[]
  unsupported_analysis: string[]
}
