import re

from app.models import ChartSpec, ColumnInfo, QueryResult

_MAX_BAR_CARDINALITY = 15

# Deliberately narrow — matches "country", "country_name", "customer_country", etc., but not
# a generic/sub-national region label like "region" or "territory" that a world map can't
# place a pin for (those still render fine as a bar chart).
_COUNTRY_COLUMN = re.compile(r"\bcountry\b", re.IGNORECASE)


def _looks_like_country_column(name: str) -> bool:
    return bool(_COUNTRY_COLUMN.search(name))


def _is_sane_hint(hint: ChartSpec, columns: list[ColumnInfo]) -> bool:
    col_names = {c.name for c in columns}
    if hint.x_field and hint.x_field not in col_names:
        return False
    if any(f not in col_names for f in hint.y_fields):
        return False
    if hint.series_field and hint.series_field not in col_names:
        return False
    return True


def select_chart(result: QueryResult, hint: ChartSpec | None = None) -> ChartSpec:
    if not result.rows:
        return ChartSpec(chart_type="table", title="No data")

    heuristic = _heuristic_chart(result)

    # A small model reaching for "table" out of uncertainty shouldn't override a heuristic
    # that clearly knows better (e.g. a 2-column datetime+numeric result is always a trend
    # line, never a table) — but a specific, sane non-table hint is still trusted, since the
    # model can pick up on things the heuristic can't.
    if hint and _is_sane_hint(hint, result.columns):
        if not (hint.chart_type == "table" and heuristic.chart_type != "table"):
            return hint

    return heuristic


def _heuristic_chart(result: QueryResult) -> ChartSpec:
    columns = result.columns
    numeric_cols = [c for c in columns if c.type == "numeric"]
    datetime_cols = [c for c in columns if c.type == "datetime"]
    categorical_cols = [c for c in columns if c.type in ("categorical", "text")]

    if result.row_count == 1 and len(numeric_cols) >= 1 and len(columns) <= 3:
        return ChartSpec(chart_type="kpi", y_fields=[c.name for c in numeric_cols], title="Result")

    if len(columns) == 2 and datetime_cols and numeric_cols:
        return ChartSpec(
            chart_type="line",
            x_field=datetime_cols[0].name,
            y_fields=[numeric_cols[0].name],
            title="Trend over time",
        )

    if len(columns) == 2 and categorical_cols and numeric_cols:
        if _looks_like_country_column(categorical_cols[0].name):
            return ChartSpec(
                chart_type="map",
                x_field=categorical_cols[0].name,
                y_fields=[numeric_cols[0].name],
                title=f"{numeric_cols[0].name} by Country",
            )
        distinct = len({r.get(categorical_cols[0].name) for r in result.rows})
        title = "Breakdown" if distinct <= _MAX_BAR_CARDINALITY else f"Top {_MAX_BAR_CARDINALITY} by {numeric_cols[0].name}"
        return ChartSpec(
            chart_type="bar",
            x_field=categorical_cols[0].name,
            y_fields=[numeric_cols[0].name],
            title=title,
        )

    if len(columns) == 2 and len(numeric_cols) == 2 and result.row_count > 3:
        return ChartSpec(
            chart_type="scatter",
            x_field=numeric_cols[0].name,
            y_fields=[numeric_cols[1].name],
            title=f"{numeric_cols[1].name} vs {numeric_cols[0].name}",
        )

    if len(columns) == 1 and numeric_cols and result.row_count > 10:
        return ChartSpec(
            chart_type="histogram",
            x_field=numeric_cols[0].name,
            y_fields=[numeric_cols[0].name],
            title=f"Distribution of {numeric_cols[0].name}",
        )

    if len(columns) == 3 and (datetime_cols or categorical_cols) and numeric_cols and len(categorical_cols) >= 1:
        x_col = datetime_cols[0] if datetime_cols else categorical_cols[0]
        series_candidates = [c for c in categorical_cols if c.name != x_col.name]
        return ChartSpec(
            chart_type="line" if datetime_cols else "bar",
            x_field=x_col.name,
            y_fields=[numeric_cols[0].name],
            series_field=series_candidates[0].name if series_candidates else None,
            title="Breakdown over groups",
        )

    return ChartSpec(chart_type="table", title="Results")
