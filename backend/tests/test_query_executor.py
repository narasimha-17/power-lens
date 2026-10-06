import pytest

from app.datasources.base import DataSource
from app.models import ColumnInfo, SchemaInfo, TableInfo
from app.pipeline import query_executor
from app.pipeline.query_executor import PipelineError, answer_question, modify_question


class _FakeSource(DataSource):
    def __init__(self, execute_error: Exception | None = None):
        self._execute_error = execute_error

    def id(self) -> str:
        return "fake"

    def source_type(self):
        return "file"

    def name(self) -> str:
        return "fake"

    def connect(self) -> None:
        pass

    def get_schema(self) -> SchemaInfo:
        return SchemaInfo(
            tables=[
                TableInfo(
                    name="sales",
                    columns=[ColumnInfo(name="revenue", type="numeric", raw_type="BIGINT")],
                )
            ],
            dialect="duckdb",
        )

    def get_sample_rows(self, table: str, n: int = 5) -> list[dict]:
        return []

    def execute_query(self, sql: str, timeout_s: float, max_rows: int):
        if self._execute_error:
            raise self._execute_error
        raise AssertionError("execute_query should not be reached in this test")

    def close(self) -> None:
        pass


class _FailsOnceThenSucceedsSource(_FakeSource):
    def __init__(self):
        super().__init__()
        self._calls = 0

    def execute_query(self, sql: str, timeout_s: float, max_rows: int):
        self._calls += 1
        if self._calls == 1:
            raise RuntimeError('Binder Error: column "OrderMonth" does not exist')
        from app.models import ColumnInfo, QueryResult
        return QueryResult(
            columns=[ColumnInfo(name="total_revenue", type="numeric", raw_type="BIGINT")],
            rows=[{"total_revenue": 42}],
            row_count=1,
            truncated=False,
            execution_ms=1.0,
        )


def test_answer_question_recovers_after_one_bad_sql_attempt(monkeypatch):
    responses = iter([
        '{"objective": "Revenue by month", "sql": "SELECT bad.OrderMonth FROM sales bad", "chart_hint": null}',
        '{"objective": "Revenue by month", "sql": "SELECT SUM(revenue) AS total_revenue FROM sales", "chart_hint": null}',
    ])
    monkeypatch.setattr(query_executor.ollama_client, "chat", lambda system, user: next(responses))
    source = _FailsOnceThenSucceedsSource()

    answer = answer_question(source, "revenue by month")

    assert answer.result.rows == [{"total_revenue": 42}]
    assert "SUM(revenue)" in answer.sql


class _AlwaysSucceedsSource(_FakeSource):
    def execute_query(self, sql: str, timeout_s: float, max_rows: int):
        from app.models import ColumnInfo, QueryResult

        return QueryResult(
            columns=[ColumnInfo(name="total_revenue", type="numeric", raw_type="BIGINT")],
            rows=[{"total_revenue": 10}],
            row_count=1,
            truncated=False,
            execution_ms=1.0,
        )


def test_answer_question_decomposes_compound_question_after_repeated_join_failure(monkeypatch):
    """Simulates a model that stubbornly keeps JOINing independent CTEs for a compound
    question no matter how many correction attempts it gets, but answers each part fine on
    its own — the real-world failure this app kept hitting."""

    def fake_chat(system, user):
        if "Question: revenue trends, top restaurants, and customer behavior" in user:
            return (
                '{"objective": "combined", "sql": '
                '"WITH a AS (SELECT 1 AS x), b AS (SELECT 2 AS y) '
                'SELECT * FROM a JOIN b ON a.x = b.y", "chart_hint": null}'
            )
        if "Question: revenue trends" in user:
            return '{"objective": "Revenue trends", "sql": "SELECT SUM(revenue) AS total_revenue FROM sales", "chart_hint": null}'
        if "Question: top restaurants" in user:
            return '{"objective": "Top restaurants", "sql": "SELECT SUM(revenue) AS total_revenue FROM sales", "chart_hint": null}'
        if "Question: customer behavior" in user:
            return '{"objective": "Customer behavior", "sql": "SELECT SUM(revenue) AS total_revenue FROM sales", "chart_hint": null}'
        raise AssertionError(f"unexpected prompt: {user}")

    monkeypatch.setattr(query_executor.ollama_client, "chat", fake_chat)
    source = _AlwaysSucceedsSource()

    answer = answer_question(source, "revenue trends, top restaurants, and customer behavior")

    assert answer.objective == "Revenue trends"
    assert len(answer.extra_answers) == 2
    assert {a.objective for a in answer.extra_answers} == {"Top restaurants", "Customer behavior"}


def test_answer_question_decomposes_two_full_questions_with_no_conjunction(monkeypatch):
    """Two complete questions typed back-to-back ("...products table? How many customers are
    there?") have no comma or "and" to split on — only a sentence boundary — but are just as
    compound as the comma/"and" case and need the same per-part fallback."""
    combined_q = "What is the average price by category? How many customers are there?"

    def fake_chat(system, user):
        if f"Question: {combined_q}" in user:
            return (
                '{"objective": "combined", "sql": '
                '"WITH a AS (SELECT 1 AS x), b AS (SELECT 2 AS y) '
                'SELECT * FROM a JOIN b ON a.x = b.y", "chart_hint": null}'
            )
        if "Question: What is the average price by category?" in user:
            return '{"objective": "Average price by category", "sql": "SELECT 1", "chart_hint": null}'
        if "Question: How many customers are there?" in user:
            return '{"objective": "Customer count", "sql": "SELECT 1", "chart_hint": null}'
        raise AssertionError(f"unexpected prompt: {user}")

    monkeypatch.setattr(query_executor.ollama_client, "chat", fake_chat)
    source = _AlwaysSucceedsSource()

    answer = answer_question(source, combined_q)

    assert answer.objective == "Average price by category"
    assert len(answer.extra_answers) == 1
    assert answer.extra_answers[0].objective == "Customer count"


def test_answer_question_does_not_decompose_a_simple_question(monkeypatch):
    monkeypatch.setattr(
        query_executor.ollama_client,
        "chat",
        lambda system, user: '{"objective": "Total revenue", "sql": "SELECT 1", "chart_hint": null}',
    )
    source = _FakeSource(execute_error=RuntimeError("boom"))

    with pytest.raises(PipelineError):
        answer_question(source, "what is total revenue")


def test_modify_question_sends_previous_sql_and_instruction_to_the_model(monkeypatch):
    captured = {}

    def fake_chat(system, user):
        captured['user'] = user
        return '{"objective": "Revenue by month as a pie chart", "sql": "SELECT month, SUM(revenue) AS total_revenue FROM sales GROUP BY month", "chart_hint": {"chart_type": "pie", "x_field": "month", "y_fields": ["total_revenue"], "series_field": null, "title": "Revenue by month"}}'

    monkeypatch.setattr(query_executor.ollama_client, "chat", fake_chat)
    source = _AlwaysSucceedsSource()

    answer = modify_question(
        source,
        question="revenue by month",
        previous_sql="SELECT month, SUM(revenue) AS total_revenue FROM sales GROUP BY month",
        previous_objective="Revenue by month",
        instruction="make this a pie chart",
    )

    assert answer.objective == "Revenue by month as a pie chart"
    assert "make this a pie chart" in captured['user']
    assert "SELECT month, SUM(revenue)" in captured['user']


def test_answer_question_wraps_db_execution_errors_as_pipeline_error(monkeypatch):
    monkeypatch.setattr(
        query_executor.ollama_client,
        "chat",
        lambda system, user: '{"objective": "Total revenue", "sql": "SELECT 1", "chart_hint": null}',
    )
    source = _FakeSource(execute_error=RuntimeError('Binder Error: column "x" does not exist'))

    with pytest.raises(PipelineError) as exc_info:
        answer_question(source, "some vague multi-part question")

    assert "Generated SQL failed to execute" in str(exc_info.value)
    assert exc_info.value.raw_llm_text is not None
