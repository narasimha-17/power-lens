from app.models import ChartSpec, ColumnInfo, QueryResult
from app.pipeline.chart_selector import select_chart


def _result(columns: list[ColumnInfo], rows: list[dict]) -> QueryResult:
    return QueryResult(columns=columns, rows=rows, row_count=len(rows), truncated=False, execution_ms=1.0)


def test_empty_result_is_table():
    result = _result([ColumnInfo(name="x", type="numeric", raw_type="INT")], [])
    assert select_chart(result).chart_type == "table"


def test_single_row_single_numeric_is_kpi():
    result = _result(
        [ColumnInfo(name="total_revenue", type="numeric", raw_type="DOUBLE")],
        [{"total_revenue": 42.0}],
    )
    spec = select_chart(result)
    assert spec.chart_type == "kpi"
    assert spec.y_fields == ["total_revenue"]


def test_two_numeric_columns_is_scatter():
    result = _result(
        [
            ColumnInfo(name="delivery_time", type="numeric", raw_type="DOUBLE"),
            ColumnInfo(name="rating", type="numeric", raw_type="DOUBLE"),
        ],
        [{"delivery_time": i, "rating": 5 - i * 0.1} for i in range(10)],
    )
    spec = select_chart(result)
    assert spec.chart_type == "scatter"
    assert spec.x_field == "delivery_time"
    assert spec.y_fields == ["rating"]


def test_single_numeric_column_many_rows_is_histogram():
    result = _result(
        [ColumnInfo(name="order_value", type="numeric", raw_type="DOUBLE")],
        [{"order_value": i} for i in range(50)],
    )
    spec = select_chart(result)
    assert spec.chart_type == "histogram"
    assert spec.x_field == "order_value"


def test_datetime_plus_numeric_is_line():
    result = _result(
        [
            ColumnInfo(name="month", type="datetime", raw_type="DATE"),
            ColumnInfo(name="revenue", type="numeric", raw_type="DOUBLE"),
        ],
        [{"month": "2024-01-01", "revenue": 10}, {"month": "2024-02-01", "revenue": 20}],
    )
    spec = select_chart(result)
    assert spec.chart_type == "line"
    assert spec.x_field == "month"
    assert spec.y_fields == ["revenue"]


def test_low_cardinality_categorical_plus_numeric_is_bar():
    result = _result(
        [
            ColumnInfo(name="region", type="categorical", raw_type="VARCHAR"),
            ColumnInfo(name="revenue", type="numeric", raw_type="DOUBLE"),
        ],
        [{"region": "EU", "revenue": 10}, {"region": "US", "revenue": 20}],
    )
    spec = select_chart(result)
    assert spec.chart_type == "bar"
    assert spec.x_field == "region"


def test_high_cardinality_categorical_still_gets_a_bar_chart():
    # A giant plain table (e.g. every restaurant name) is unreadable; the frontend caps
    # bar/pie charts to the top N by value, so this should still be a chart, not a table.
    columns = [
        ColumnInfo(name="customer_id", type="categorical", raw_type="VARCHAR"),
        ColumnInfo(name="revenue", type="numeric", raw_type="DOUBLE"),
    ]
    rows = [{"customer_id": str(i), "revenue": i} for i in range(30)]
    result = _result(columns, rows)
    spec = select_chart(result)
    assert spec.chart_type == "bar"
    assert spec.x_field == "customer_id"
    assert "Top" in spec.title


def test_sane_llm_hint_is_used_verbatim():
    result = _result(
        [
            ColumnInfo(name="region", type="categorical", raw_type="VARCHAR"),
            ColumnInfo(name="revenue", type="numeric", raw_type="DOUBLE"),
        ],
        [{"region": "EU", "revenue": 10}],
    )
    hint = ChartSpec(chart_type="pie", x_field="region", y_fields=["revenue"], title="Custom")
    spec = select_chart(result, hint)
    assert spec.chart_type == "pie"
    assert spec.title == "Custom"


def test_table_hint_is_overridden_when_a_clear_trend_line_exists():
    # A small model unsure how to chart a simple daily trend sometimes hints "table" even
    # though a line chart is obviously right here; the heuristic should win in that case.
    result = _result(
        [
            ColumnInfo(name="order_date", type="datetime", raw_type="DATE"),
            ColumnInfo(name="order_count", type="numeric", raw_type="BIGINT"),
        ],
        [{"order_date": "2025-01-01", "order_count": 42}, {"order_date": "2025-01-02", "order_count": 28}],
    )
    hint = ChartSpec(chart_type="table", title="Daily order counts")
    spec = select_chart(result, hint)
    assert spec.chart_type == "line"
    assert spec.x_field == "order_date"


def test_table_hint_is_respected_when_no_better_heuristic_exists():
    result = _result(
        [
            ColumnInfo(name="a", type="text", raw_type="VARCHAR"),
            ColumnInfo(name="b", type="text", raw_type="VARCHAR"),
            ColumnInfo(name="c", type="text", raw_type="VARCHAR"),
            ColumnInfo(name="d", type="text", raw_type="VARCHAR"),
        ],
        [{"a": "1", "b": "2", "c": "3", "d": "4"}],
    )
    hint = ChartSpec(chart_type="table", title="Results")
    spec = select_chart(result, hint)
    assert spec.chart_type == "table"


def test_insane_llm_hint_referencing_unknown_column_is_ignored():
    result = _result(
        [ColumnInfo(name="revenue", type="numeric", raw_type="DOUBLE")],
        [{"revenue": 10}],
    )
    hint = ChartSpec(chart_type="bar", x_field="nonexistent_column", y_fields=["revenue"])
    spec = select_chart(result, hint)
    assert spec.chart_type != "bar" or spec.x_field != "nonexistent_column"
