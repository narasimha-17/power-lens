from app.datasources.base import DataSource
from app.db.duckdb_engine import get_connection, get_lock
from app.models import (
    BreakdownItem,
    OverviewBreakdown,
    OverviewFilters,
    OverviewInsight,
    OverviewKpi,
    OverviewResponse,
    OverviewTrend,
    TrendPoint,
)

_MAX_KPIS = 2
_MAX_BREAKDOWN_ITEMS = 8


def _quote(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _category_deltas(conn, table_name, where_sql, params, cat_col, value_col, date_col) -> dict[str, float]:
    rows = conn.execute(
        f"SELECT {_quote(cat_col)} AS category, date_trunc('month', {_quote(date_col)}) AS bucket, "
        f"SUM({_quote(value_col)}) AS value "
        f"FROM {table_name}{where_sql} "
        f"GROUP BY 1, 2 ORDER BY 1, 2 DESC",
        params,
    ).fetchall()
    by_category: dict[str, list[float]] = {}
    for category, _bucket, value in rows:
        by_category.setdefault(str(category), []).append(value)

    deltas: dict[str, float] = {}
    for category, values in by_category.items():
        if len(values) >= 2 and values[0] is not None and values[1]:
            deltas[category] = ((values[0] - values[1]) / values[1]) * 100
    return deltas


def _build_insights(
    kpis: list[OverviewKpi],
    breakdown: OverviewBreakdown | None,
) -> list[OverviewInsight]:
    insights: list[OverviewInsight] = []
    if not kpis:
        return insights

    primary = kpis[0]

    if primary.delta_pct is not None:
        if primary.delta_pct >= 0:
            insights.append(
                OverviewInsight(
                    tone="good",
                    title="Growth is trending up",
                    description=(
                        f"{primary.label} rose {primary.delta_pct:.1f}% versus the previous month."
                    ),
                )
            )
        else:
            insights.append(
                OverviewInsight(
                    tone="warning",
                    title="Growth is slowing",
                    description=(
                        f"{primary.label} fell {abs(primary.delta_pct):.1f}% versus the previous month."
                    ),
                )
            )

    if breakdown and breakdown.items:
        total = sum(item.value or 0 for item in breakdown.items)
        top = breakdown.items[0]
        if total > 0 and top.value:
            share = (top.value / total) * 100
            if share >= 25:
                insights.append(
                    OverviewInsight(
                        tone="good",
                        title=f"{top.category} is your leading {breakdown.category_field.replace('_', ' ')}",
                        description=(
                            f"{top.category} contributes {share:.0f}% of total {breakdown.value_field.replace('_', ' ')}."
                        ),
                    )
                )

        declining = [item for item in breakdown.items if item.delta_pct is not None and item.delta_pct < -1]
        if declining:
            worst = min(declining, key=lambda item: item.delta_pct or 0)
            insights.append(
                OverviewInsight(
                    tone="critical" if (worst.delta_pct or 0) < -15 else "warning",
                    title=f"{worst.category} needs attention",
                    description=(
                        f"{worst.category} {breakdown.value_field.replace('_', ' ')} dropped "
                        f"{abs(worst.delta_pct or 0):.1f}% versus the previous month."
                    ),
                )
            )

    return insights


def build_overview(
    source: DataSource,
    category_filter: str | None = None,
    year_filter: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> OverviewResponse:
    schema = source.get_schema()
    table = schema.tables[0]
    table_name = table.name

    numeric_cols = [c for c in table.columns if c.type == "numeric"]
    datetime_cols = [c for c in table.columns if c.type == "datetime"]
    categorical_cols = [c for c in table.columns if c.type == "categorical"]

    if year_filter and datetime_cols:
        date_from = f"{year_filter}-01-01"
        date_to = f"{year_filter}-12-31"

    where_clauses: list[str] = []
    params: list[object] = []
    if category_filter and categorical_cols:
        where_clauses.append(f"{_quote(categorical_cols[0].name)} = ?")
        params.append(category_filter)
    if date_from and datetime_cols:
        where_clauses.append(f"{_quote(datetime_cols[0].name)} >= CAST(? AS DATE)")
        params.append(date_from)
    if date_to and datetime_cols:
        where_clauses.append(f"{_quote(datetime_cols[0].name)} <= CAST(? AS DATE)")
        params.append(date_to)
    where_sql = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    conn = get_connection()

    with get_lock():
        record_count = conn.execute(
            f"SELECT COUNT(*) FROM {table_name}{where_sql}", params
        ).fetchone()[0]

        date_col = datetime_cols[0] if datetime_cols else None

        kpis: list[OverviewKpi] = []
        for col in numeric_cols[:_MAX_KPIS]:
            row = conn.execute(
                f"SELECT SUM({_quote(col.name)}), AVG({_quote(col.name)}), COUNT({_quote(col.name)}) "
                f"FROM {table_name}{where_sql}",
                params,
            ).fetchone()

            delta_pct: float | None = None
            if date_col is not None:
                month_rows = conn.execute(
                    f"SELECT date_trunc('month', {_quote(date_col.name)}) AS bucket, "
                    f"SUM({_quote(col.name)}) AS value "
                    f"FROM {table_name}{where_sql} "
                    f"GROUP BY 1 ORDER BY 1 DESC LIMIT 2",
                    params,
                ).fetchall()
                if len(month_rows) == 2:
                    latest, previous = month_rows[0][1], month_rows[1][1]
                    if latest is not None and previous:
                        delta_pct = ((latest - previous) / previous) * 100

            kpis.append(
                OverviewKpi(
                    field=col.name,
                    label=col.name.replace("_", " ").title(),
                    total=row[0],
                    average=row[1],
                    count=row[2] or 0,
                    delta_pct=delta_pct,
                )
            )

        trend: OverviewTrend | None = None
        if date_col is not None and numeric_cols:
            value_col = numeric_cols[0]
            rows = conn.execute(
                f"SELECT date_trunc('month', {_quote(date_col.name)}) AS bucket, "
                f"SUM({_quote(value_col.name)}) AS value "
                f"FROM {table_name}{where_sql} "
                f"GROUP BY 1 ORDER BY 1",
                params,
            ).fetchall()
            trend = OverviewTrend(
                date_field=date_col.name,
                value_field=value_col.name,
                points=[TrendPoint(bucket=str(r[0]), value=r[1]) for r in rows],
            )

        breakdown: OverviewBreakdown | None = None
        if categorical_cols and numeric_cols:
            cat_col = categorical_cols[0]
            value_col = numeric_cols[0]
            rows = conn.execute(
                f"SELECT {_quote(cat_col.name)} AS category, SUM({_quote(value_col.name)}) AS value "
                f"FROM {table_name}{where_sql} "
                f"GROUP BY 1 ORDER BY value DESC LIMIT {_MAX_BREAKDOWN_ITEMS}",
                params,
            ).fetchall()

            category_deltas: dict[str, float] = {}
            if date_col is not None:
                category_deltas = _category_deltas(
                    conn, table_name, where_sql, params, cat_col.name, value_col.name, date_col.name
                )

            breakdown = OverviewBreakdown(
                category_field=cat_col.name,
                value_field=value_col.name,
                items=[
                    BreakdownItem(category=str(r[0]), value=r[1], delta_pct=category_deltas.get(str(r[0])))
                    for r in rows
                ],
            )

        category_values: list[str] = []
        if categorical_cols:
            rows = conn.execute(
                f"SELECT DISTINCT {_quote(categorical_cols[0].name)} FROM {table_name} "
                f"WHERE {_quote(categorical_cols[0].name)} IS NOT NULL LIMIT 50"
            ).fetchall()
            category_values = [str(r[0]) for r in rows]

        available_years: list[int] = []
        if date_col is not None:
            rows = conn.execute(
                f"SELECT DISTINCT EXTRACT(YEAR FROM {_quote(date_col.name)})::INT AS y "
                f"FROM {table_name} WHERE {_quote(date_col.name)} IS NOT NULL ORDER BY y DESC"
            ).fetchall()
            available_years = [r[0] for r in rows]

    return OverviewResponse(
        table=table_name,
        record_count=record_count,
        kpis=kpis,
        trend=trend,
        breakdown=breakdown,
        filters=OverviewFilters(
            categorical_columns=[c.name for c in categorical_cols],
            datetime_columns=[c.name for c in datetime_cols],
            category_values=category_values,
            available_years=available_years,
        ),
        insights=_build_insights(kpis, breakdown),
    )
