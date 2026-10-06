from typing import Literal

from pydantic import BaseModel

SourceType = Literal["file", "sql", "live"]
ChartType = Literal[
    "bar", "stacked_bar", "line", "area", "pie", "scatter", "histogram", "treemap", "kpi", "table",
    "gauge", "text", "funnel", "waterfall", "map",
]
# Mosaic tile size on a dashboard grid — "sm" for compact tiles (kpi/gauge/text), up through
# "xl" for a large chart that should dominate its area (a big pie/breakdown). Purely a
# display hint; never affects how the chart's data is queried or computed.
TileSize = Literal["sm", "md", "lg", "xl"]


class ColumnInfo(BaseModel):
    name: str
    type: str  # normalized: "numeric" | "datetime" | "categorical" | "text"
    raw_type: str  # the source's native type string


class TableInfo(BaseModel):
    name: str
    columns: list[ColumnInfo]
    row_count_estimate: int | None = None


class SchemaInfo(BaseModel):
    tables: list[TableInfo]
    dialect: str  # "duckdb" | "postgresql" | "mysql" | "sqlite"


class QueryResult(BaseModel):
    columns: list[ColumnInfo]
    rows: list[dict]
    row_count: int
    truncated: bool
    execution_ms: float


class ChartSpec(BaseModel):
    chart_type: ChartType
    x_field: str | None = None
    y_fields: list[str] = []
    series_field: str | None = None
    title: str = ""


class QueryAnswer(BaseModel):
    objective: str
    sql: str
    chart_spec: ChartSpec
    result: QueryResult
    execution_ms: float
    extra_answers: list["QueryAnswer"] = []


class SourceInfo(BaseModel):
    id: str
    source_type: SourceType
    name: str
    status: str = "connected"
    last_refreshed: str | None = None
    refresh_interval_s: int | None = None


class SqlConnectionRequest(BaseModel):
    dialect: Literal["postgresql", "mysql"]
    host: str
    port: int
    database: str
    user: str
    password: str = ""
    display_name: str
    tables: list[str] | None = None


class RefreshScheduleRequest(BaseModel):
    interval_s: int | None = None


class RecentSqlConnection(BaseModel):
    """A remembered SQL connection profile — everything needed to refill the connect form
    except the password, which is deliberately never persisted (see SqlSource/routes_
    datasources' "credentials are kept in memory only" comment). Saved automatically after
    every successful connection so reconnecting after a backend restart is a couple of
    clicks plus the password, not retyping host/port/database/user from scratch."""

    id: str
    dialect: Literal["postgresql", "mysql"]
    host: str
    port: int
    database: str
    user: str
    display_name: str
    last_connected_at: str


class TableRelationship(BaseModel):
    """A user-defined join key between two tables on the same source (e.g.
    `orders.customer_id = customers.id`) — surfaced into the NL→SQL prompt as a hint so the
    model doesn't have to guess a join column from naming conventions alone, which is where
    most multi-table query mistakes come from."""

    id: str
    sourceId: str
    tableA: str
    columnA: str
    tableB: str
    columnB: str
    createdAt: str


class UrlConnectionRequest(BaseModel):
    url: str
    display_name: str
    format: Literal["csv", "parquet", "json"] | None = None
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_region: str | None = None


class ApiConnectionRequest(BaseModel):
    url: str
    display_name: str
    headers: dict[str, str] = {}
    records_path: str | None = None


class OverviewKpi(BaseModel):
    field: str
    label: str
    total: float | None = None
    average: float | None = None
    count: int
    delta_pct: float | None = None


class TrendPoint(BaseModel):
    bucket: str
    value: float | None


class OverviewTrend(BaseModel):
    date_field: str
    value_field: str
    points: list[TrendPoint]


class BreakdownItem(BaseModel):
    category: str
    value: float | None
    delta_pct: float | None = None


class OverviewBreakdown(BaseModel):
    category_field: str
    value_field: str
    items: list[BreakdownItem]


class OverviewFilters(BaseModel):
    categorical_columns: list[str]
    datetime_columns: list[str]
    category_values: list[str] = []
    available_years: list[int] = []


class OverviewInsight(BaseModel):
    tone: Literal["good", "warning", "critical"]
    title: str
    description: str


class OverviewResponse(BaseModel):
    table: str
    record_count: int
    kpis: list[OverviewKpi]
    trend: OverviewTrend | None
    breakdown: OverviewBreakdown | None
    filters: OverviewFilters
    insights: list[OverviewInsight] = []


class ForecastPoint(BaseModel):
    bucket: str
    value: float | None
    is_forecast: bool


class ForecastResponse(BaseModel):
    date_field: str
    value_field: str
    numeric_fields: list[str]
    method: str
    periods_history: int
    periods_forecast: int
    points: list[ForecastPoint]


# NOTE: camelCase fields below, unlike everything else in this file — Dashboard/PinnedChart
# started out as a frontend-only shape (persisted in browser localStorage) before this
# database existed. Mirroring that shape field-for-field means the existing dashboard UI
# needed zero changes when its storage moved from localStorage to a real backend database.
class PinnedChart(BaseModel):
    id: str
    question: str
    sourceId: str
    sourceName: str
    answer: QueryAnswer
    pinnedAt: str
    color: str | None = None
    size: TileSize | None = None
    live: bool = False


class Dashboard(BaseModel):
    id: str
    name: str
    createdAt: str
    updatedAt: str
    charts: list[PinnedChart] = []
    isFavorite: bool = False


MeasureFormat = Literal["number", "currency", "percent"]


class CustomMeasure(BaseModel):
    """A reusable named calculation (e.g. profit_margin = SUM(profit)/SUM(revenue)) — the
    closest equivalent here to a Power BI DAX measure. Its expression is injected into the
    NL-to-SQL prompt so every question that touches this source computes it the same way,
    instead of each generated query re-deriving (and potentially getting wrong) the formula."""

    id: str
    sourceId: str
    name: str
    expression: str
    description: str | None = None
    format: MeasureFormat = "number"
    createdAt: str


AlertOperator = Literal["gt", "lt", "gte", "lte", "eq"]


class ChartRefreshConfig(BaseModel):
    """Auto-refresh + threshold-alert settings for one pinned chart. A background scheduler
    re-runs the chart's underlying question every `intervalMinutes` and, if an alert
    threshold is configured, raises an Alert whenever the first numeric value in the result
    crosses it."""

    chartId: str
    dashboardId: str
    sourceId: str
    question: str
    intervalMinutes: int
    alertField: str | None = None
    alertOperator: AlertOperator | None = None
    alertThreshold: float | None = None
    lastRunAt: str | None = None
    lastAlertAt: str | None = None


class Alert(BaseModel):
    id: str
    dashboardId: str
    chartId: str
    message: str
    createdAt: str
    seen: bool = False


class SharedDashboardLink(BaseModel):
    token: str
    dashboardId: str
    createdAt: str
