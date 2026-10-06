import pytest

from app.datasources.file_source import FileSource
from app.pipeline.forecast import ForecastError, build_forecast


def test_build_forecast_projects_a_linear_trend(tmp_path):
    csv_path = tmp_path / "sales.csv"
    csv_path.write_text(
        "order_date,revenue\n"
        "2024-01-01,100\n"
        "2024-02-01,200\n"
        "2024-03-01,300\n"
        "2024-04-01,400\n"
    )
    source = FileSource(str(csv_path), "sales", source_id="test_forecast_src")
    source.connect()
    try:
        result = build_forecast(source, value_field=None, periods=2)
        assert result.date_field == "order_date"
        assert result.value_field == "revenue"
        assert result.periods_history == 4
        assert result.periods_forecast == 2
        history_points = [p for p in result.points if not p.is_forecast]
        forecast_points = [p for p in result.points if p.is_forecast]
        assert len(history_points) == 4
        assert len(forecast_points) == 2
        # A perfectly linear +100/month trend should project forward the same way.
        assert forecast_points[0].value == pytest.approx(500, abs=1e-6)
        assert forecast_points[1].value == pytest.approx(600, abs=1e-6)
        assert forecast_points[0].bucket == "2024-05-01"
        assert forecast_points[1].bucket == "2024-06-01"
    finally:
        source.close()


def test_build_forecast_rejects_too_little_history(tmp_path):
    csv_path = tmp_path / "sales.csv"
    csv_path.write_text("order_date,revenue\n2024-01-01,100\n2024-02-01,200\n")
    source = FileSource(str(csv_path), "sales", source_id="test_forecast_short_src")
    source.connect()
    try:
        with pytest.raises(ForecastError):
            build_forecast(source, value_field=None, periods=3)
    finally:
        source.close()


def test_build_forecast_rejects_source_without_date_column(tmp_path):
    csv_path = tmp_path / "sales.csv"
    csv_path.write_text("region,revenue\nUS,100\nEU,200\n")
    source = FileSource(str(csv_path), "sales", source_id="test_forecast_nodate_src")
    source.connect()
    try:
        with pytest.raises(ForecastError):
            build_forecast(source, value_field=None, periods=3)
    finally:
        source.close()


def test_build_forecast_skips_attribute_columns_for_the_default_measure(tmp_path):
    csv_path = tmp_path / "sales.csv"
    csv_path.write_text(
        "order_date,customer_age,revenue\n"
        "2024-01-01,30,100\n"
        "2024-02-01,31,200\n"
        "2024-03-01,29,300\n"
    )
    source = FileSource(str(csv_path), "sales", source_id="test_forecast_default_measure_src")
    source.connect()
    try:
        # customer_age is the first numeric column but isn't a meaningful business metric to
        # sum/trend — the default should skip it in favor of revenue.
        result = build_forecast(source, value_field=None, periods=1)
        assert result.value_field == "revenue"
    finally:
        source.close()


def test_build_forecast_honors_requested_value_field(tmp_path):
    csv_path = tmp_path / "sales.csv"
    csv_path.write_text(
        "order_date,revenue,units\n"
        "2024-01-01,100,10\n"
        "2024-02-01,200,15\n"
        "2024-03-01,300,20\n"
    )
    source = FileSource(str(csv_path), "sales", source_id="test_forecast_field_src")
    source.connect()
    try:
        result = build_forecast(source, value_field="units", periods=1)
        assert result.value_field == "units"
        assert set(result.numeric_fields) == {"revenue", "units"}
    finally:
        source.close()
