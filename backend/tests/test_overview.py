import os

from app.datasources.file_source import FileSource
from app.pipeline.overview import build_overview


def test_build_overview_computes_real_aggregates(tmp_path):
    csv_path = tmp_path / "sales.csv"
    csv_path.write_text(
        "order_date,region,revenue\n"
        "2024-01-01,US,100\n"
        "2024-01-15,EU,50\n"
        "2024-02-01,US,200\n"
    )
    source = FileSource(str(csv_path), "sales", source_id="test_overview_src")
    source.connect()
    try:
        overview = build_overview(source)
        assert overview.record_count == 3
        assert len(overview.kpis) == 1
        assert overview.kpis[0].field == "revenue"
        assert overview.kpis[0].total == 350
        # Jan total = 150, Feb total = 200 -> +33.33%
        assert overview.kpis[0].delta_pct == ((200 - 150) / 150) * 100
        assert overview.trend is not None
        assert overview.breakdown is not None
        breakdown_by_cat = {item.category: item.value for item in overview.breakdown.items}
        assert breakdown_by_cat == {"US": 300, "EU": 50}
        assert set(overview.filters.category_values) == {"US", "EU"}
        assert overview.filters.available_years == [2024]

        us_item = next(i for i in overview.breakdown.items if i.category == "US")
        assert us_item.delta_pct == ((200 - 100) / 100) * 100
        eu_item = next(i for i in overview.breakdown.items if i.category == "EU")
        assert eu_item.delta_pct is None  # only one month of EU data -> no comparison possible

        assert len(overview.insights) >= 1
        assert overview.insights[0].tone == "good"  # overall revenue grew month over month
    finally:
        source.close()


def test_build_overview_applies_year_filter(tmp_path):
    csv_path = tmp_path / "sales.csv"
    csv_path.write_text(
        "order_date,region,revenue\n"
        "2023-06-01,US,500\n"
        "2024-01-01,US,100\n"
        "2024-02-01,US,200\n"
    )
    source = FileSource(str(csv_path), "sales", source_id="test_overview_year_src")
    source.connect()
    try:
        overview = build_overview(source, year_filter=2024)
        assert overview.record_count == 2
        assert overview.kpis[0].total == 300
        assert overview.filters.available_years == [2024, 2023]
    finally:
        source.close()


def test_build_overview_applies_category_filter(tmp_path):
    csv_path = tmp_path / "sales.csv"
    csv_path.write_text(
        "order_date,region,revenue\n"
        "2024-01-01,US,100\n"
        "2024-01-15,EU,50\n"
        "2024-02-01,US,200\n"
    )
    source = FileSource(str(csv_path), "sales", source_id="test_overview_filter_src")
    source.connect()
    try:
        overview = build_overview(source, category_filter="US")
        assert overview.record_count == 2
        assert overview.kpis[0].total == 300
    finally:
        source.close()
