import pytest

from app.llm.query_validator import QueryValidationError, validate_and_prepare


def test_allows_simple_select():
    sql = validate_and_prepare("SELECT * FROM sales", "duckdb", max_rows=1000)
    assert "SELECT * FROM sales" in sql
    assert "LIMIT 1000" in sql


def test_allows_with_cte():
    sql = validate_and_prepare(
        "WITH t AS (SELECT 1 AS x) SELECT * FROM t", "duckdb", max_rows=1000
    )
    assert "LIMIT 1000" in sql


def test_preserves_smaller_existing_limit():
    sql = validate_and_prepare("SELECT * FROM sales LIMIT 10", "duckdb", max_rows=1000)
    assert "LIMIT 10" in sql
    assert "LIMIT 1000" not in sql


def test_caps_larger_existing_limit():
    sql = validate_and_prepare("SELECT * FROM sales LIMIT 999999", "duckdb", max_rows=1000)
    assert "LIMIT 1000" in sql


@pytest.mark.parametrize(
    "sql",
    [
        "DROP TABLE sales",
        "DELETE FROM sales",
        "UPDATE sales SET revenue = 0",
        "INSERT INTO sales VALUES (1)",
        "ALTER TABLE sales ADD COLUMN x INT",
        "ATTACH 'evil.db' AS evil",
        "SELECT * FROM sales; DROP TABLE sales",
        "CREATE TABLE x AS SELECT * FROM sales",
        "PRAGMA table_info(sales)",
    ],
)
def test_rejects_unsafe_sql(sql):
    with pytest.raises(QueryValidationError):
        validate_and_prepare(sql, "duckdb", max_rows=1000)


def test_allows_keyword_like_substrings_in_string_literals():
    sql = validate_and_prepare(
        "SELECT * FROM sales WHERE status = 'update_pending'", "duckdb", max_rows=1000
    )
    assert "update_pending" in sql


def test_rewrites_mysql_style_date_call_for_duckdb():
    sql = validate_and_prepare(
        "SELECT * FROM sales WHERE order_date >= DATE('2024-01-01')", "duckdb", max_rows=1000
    )
    assert "DATE('2024-01-01')" not in sql
    assert "CAST('2024-01-01' AS DATE)" in sql


def test_allows_with_ctes_combined_by_union_all():
    sql = validate_and_prepare(
        "WITH a AS (SELECT 1 AS x), b AS (SELECT 2 AS x) "
        "SELECT * FROM a UNION ALL SELECT * FROM b",
        "duckdb",
        max_rows=1000,
    )
    assert "UNION ALL" in sql
    assert "LIMIT 1000" in sql


def test_rejects_join_between_two_independent_ctes():
    sql = (
        "WITH revenue_trends AS (SELECT order_date, SUM(revenue) AS rev FROM sales GROUP BY order_date), "
        "delivery_efficiency AS (SELECT delivery_partner_id, AVG(time) AS avg_time FROM sales GROUP BY delivery_partner_id) "
        "SELECT * FROM revenue_trends JOIN delivery_efficiency "
        "ON revenue_trends.order_date = delivery_efficiency.delivery_partner_id"
    )
    with pytest.raises(QueryValidationError, match="JOINs independently-aggregated CTEs"):
        validate_and_prepare(sql, "duckdb", max_rows=1000)


def test_allows_a_single_cte_joined_to_a_real_table():
    sql = (
        "WITH totals AS (SELECT region, SUM(revenue) AS rev FROM sales GROUP BY region) "
        "SELECT totals.region, totals.rev, regions.manager "
        "FROM totals JOIN regions ON totals.region = regions.region"
    )
    result = validate_and_prepare(sql, "duckdb", max_rows=1000)
    assert "JOIN regions" in result


def test_leaves_date_call_alone_for_non_duckdb_dialects():
    sql = validate_and_prepare(
        "SELECT * FROM sales WHERE order_date >= DATE('2024-01-01')", "postgresql", max_rows=1000
    )
    assert "DATE('2024-01-01')" in sql
