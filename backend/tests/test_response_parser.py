import pytest

from app.llm.response_parser import ResponseParseError, parse_llm_response


def test_parses_clean_json():
    raw = '{"objective": "Total revenue", "sql": "SELECT 1", "chart_hint": null}'
    result = parse_llm_response(raw)
    assert result.objective == "Total revenue"
    assert result.sql == "SELECT 1"


def test_parses_json_in_markdown_fence():
    raw = '```json\n{"objective": "Total revenue", "sql": "SELECT 1"}\n```'
    result = parse_llm_response(raw)
    assert result.objective == "Total revenue"


def test_ignores_trailing_commentary_after_json():
    raw = (
        '{"objective": "Total revenue", "sql": "SELECT 1", "chart_hint": null}\n\n'
        "Let me know if you'd like a different breakdown!"
    )
    result = parse_llm_response(raw)
    assert result.objective == "Total revenue"


def test_ignores_trailing_duplicate_json_object():
    raw = (
        '{"objective": "Total revenue", "sql": "SELECT 1", "chart_hint": null}'
        '{"objective": "Total revenue (again)", "sql": "SELECT 2"}'
    )
    result = parse_llm_response(raw)
    assert result.objective == "Total revenue"
    assert result.sql == "SELECT 1"


def test_handles_nested_chart_hint_with_trailing_junk():
    raw = (
        '{"objective": "Revenue by region", "sql": "SELECT region FROM sales", '
        '"chart_hint": {"chart_type": "bar", "x_field": "region", "y_fields": ["revenue"], '
        '"series_field": null, "title": "Revenue by Region"}} some trailing text {oops'
    )
    result = parse_llm_response(raw)
    assert result.chart_hint is not None
    assert result.chart_hint.chart_type == "bar"


def test_raises_when_no_json_object_present():
    with pytest.raises(ResponseParseError):
        parse_llm_response("Sorry, I can't help with that.")


def test_accepts_query_key_as_sql_alias():
    # A small local model occasionally names the SQL field "query" instead of "sql" (and
    # sometimes drops "objective" entirely) despite the prompt spelling out the exact keys.
    raw = '{"query": "SELECT AVG(price) AS average_price FROM products GROUP BY category"}'
    result = parse_llm_response(raw)
    assert result.sql == "SELECT AVG(price) AS average_price FROM products GROUP BY category"
    assert result.objective  # falls back to a generic default rather than failing outright


def test_accepts_explanation_key_as_objective_alias():
    raw = '{"explanation": "Average price per category", "sql_query": "SELECT 1"}'
    result = parse_llm_response(raw)
    assert result.objective == "Average price per category"
    assert result.sql == "SELECT 1"
