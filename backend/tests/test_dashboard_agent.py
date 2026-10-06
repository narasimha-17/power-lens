from app.datasources.base import DataSource
from app.datasources.file_source import FileSource
from app.models import ChartSpec, ColumnInfo, QueryResult, SchemaInfo, TableInfo
from app.pipeline import dashboard_agent
from app.pipeline.query_executor import QueryAnswer


class _FakeAgent:
    """Stands in for strands.Agent: pulls the registered tool and drives it a couple of
    times, the way a real ReAct loop would, without needing a live Ollama model."""

    def __init__(self, model, tools, system_prompt):
        self.tool = tools[0]

    def __call__(self, prompt: str, **kwargs):
        self.tool("total revenue")
        self.tool("revenue by region")
        return "done"


class _FailingFakeAgent(_FakeAgent):
    def __call__(self, prompt: str, **kwargs):
        self.tool("total revenue")
        raise RuntimeError("model connection dropped")


class _NoOpFakeAgent:
    """Simulates a model that calls the tool zero times, to verify the fallback templates
    alone can build the dashboard."""

    def __init__(self, model, tools, system_prompt):
        self.tool = tools[0]

    def __call__(self, prompt: str, **kwargs):
        return "done"


def _make_source(tmp_path):
    """A schema with 2 numeric, 2 categorical, and 1 datetime column, so the template
    generator has enough variety to exercise trends, breakdowns, and cross-tabs."""
    csv_path = tmp_path / "sales.csv"
    csv_path.write_text(
        "order_date,region,category,revenue,units\n"
        "2024-01-01,US,Electronics,100,5\n"
        "2024-01-15,EU,Clothing,50,3\n"
        "2024-02-01,US,Electronics,200,8\n"
        "2024-02-10,APAC,Clothing,150,6\n"
    )
    source = FileSource(str(csv_path), "sales", source_id="test_agent_src")
    source.connect()
    return source


def _make_source_with_age(tmp_path):
    csv_path = tmp_path / "orders.csv"
    csv_path.write_text(
        "order_date,region,customer_age,revenue\n"
        "2024-01-01,US,34,100\n"
        "2024-01-15,EU,45,50\n"
        "2024-02-01,US,29,200\n"
        "2024-02-10,APAC,52,150\n"
    )
    source = FileSource(str(csv_path), "orders", source_id="test_agent_age_src")
    source.connect()
    return source


def _fake_answer(source, question) -> QueryAnswer:
    result = QueryResult(
        columns=[], rows=[{"total_revenue": 350}], row_count=1, truncated=False, execution_ms=1.0
    )
    return QueryAnswer(
        objective=f"answer to: {question}",
        sql="SELECT 1",
        chart_spec=ChartSpec(chart_type="kpi", y_fields=["total_revenue"]),
        result=result,
        execution_ms=1.0,
    )


class _AlwaysFailsSource(DataSource):
    """A minimal DataSource whose execute_query always raises, used to verify that both
    the agent-tool phase and the template-fallback phase record failures uniformly."""

    def id(self) -> str:
        return "always-fails"

    def source_type(self):
        return "file"

    def name(self) -> str:
        return "always_fails"

    def connect(self) -> None:
        pass

    def get_schema(self) -> SchemaInfo:
        return SchemaInfo(
            tables=[
                TableInfo(
                    name="t",
                    columns=[
                        ColumnInfo(name="revenue", type="numeric", raw_type="BIGINT"),
                        ColumnInfo(name="region", type="categorical", raw_type="VARCHAR"),
                    ],
                )
            ],
            dialect="duckdb",
        )

    def get_sample_rows(self, table: str, n: int = 5) -> list[dict]:
        return []

    def execute_query(self, sql: str, timeout_s: float, max_rows: int):
        raise RuntimeError("db unavailable")

    def close(self) -> None:
        pass


def test_fallback_templates_include_scatter_area_and_histogram(tmp_path):
    source = _make_source(tmp_path)
    try:
        templates = dashboard_agent._fallback_templates(source)
        chart_types = {hint.chart_type for _, _, hint in templates if hint is not None}
        assert "scatter" in chart_types
        assert "histogram" in chart_types
        assert "area" in chart_types
        assert "stacked_bar" in chart_types
    finally:
        source.close()


def test_fallback_templates_always_include_bar_and_pie(tmp_path):
    source = _make_source(tmp_path)
    try:
        templates = dashboard_agent._fallback_templates(source)
        chart_types = {hint.chart_type for _, _, hint in templates if hint is not None}
        assert "bar" in chart_types
        assert "pie" in chart_types
    finally:
        source.close()


def test_fallback_templates_exclude_age_from_summable_measures(tmp_path):
    source = _make_source_with_age(tmp_path)
    try:
        templates = dashboard_agent._fallback_templates(source)
        # "total/trend of customer_age" is not a meaningful business metric — age should
        # never be summed or plotted as a trend, only used for distribution/averages.
        for question, sql, _hint in templates:
            lower_q = question.lower()
            if "total customer_age" in lower_q or "trend of total customer_age" in lower_q:
                raise AssertionError(f"customer_age should not be summed/trended: {question!r}")
            assert 'SUM("customer_age")' not in sql
    finally:
        source.close()


def test_run_auto_dashboard_combines_agent_and_template_results(tmp_path, monkeypatch):
    monkeypatch.setattr(dashboard_agent, "Agent", _FakeAgent)
    monkeypatch.setattr(dashboard_agent, "answer_question", _fake_answer)
    source = _make_source(tmp_path)
    try:
        result = dashboard_agent.run_auto_dashboard(source)
        assert result.dashboard_name == "sales Overview"
        ok_steps = [s for s in result.steps if s.status == "ok"]
        # 2 from the fake agent, plus real template-generated charts against the real data.
        assert len(ok_steps) > 2
        assert all(s.answer is not None for s in ok_steps)

        chart_types = {s.answer.chart_spec.chart_type for s in ok_steps if s.answer}
        # The template set should give real variety, not just KPI cards.
        assert "bar" in chart_types
        assert "line" in chart_types
        assert "pie" in chart_types
        assert chart_types != {"kpi"}

        # At least one line chart should be a genuine multi-series (multi-line) chart.
        multi_line_steps = [
            s for s in ok_steps
            if s.answer and s.answer.chart_spec.chart_type == "line" and s.answer.chart_spec.series_field
        ]
        assert len(multi_line_steps) > 0
    finally:
        source.close()


def test_run_auto_dashboard_template_fallback_alone_builds_varied_charts(tmp_path, monkeypatch):
    monkeypatch.setattr(dashboard_agent, "Agent", _NoOpFakeAgent)
    source = _make_source(tmp_path)
    try:
        result = dashboard_agent.run_auto_dashboard(source)
        ok_steps = [s for s in result.steps if s.status == "ok"]
        assert len(ok_steps) > 5
        kpi_count = sum(1 for s in ok_steps if s.answer and s.answer.chart_spec.chart_type == "kpi")
        # A real overview dashboard opens with at least 3 headline stat cards, but a handful
        # of plain KPI numbers should still stay a minority of a much larger chart set.
        assert kpi_count >= 3
        assert kpi_count <= 5
        assert kpi_count < len(ok_steps)
    finally:
        source.close()


def test_run_auto_dashboard_skips_agent_phase_when_manual_query_already_active(tmp_path, monkeypatch):
    class _ShouldNotBeCalledAgent:
        def __init__(self, model, tools, system_prompt):
            raise AssertionError("agent phase should have been skipped entirely")

    monkeypatch.setattr(dashboard_agent, "Agent", _ShouldNotBeCalledAgent)
    monkeypatch.setattr(dashboard_agent, "manual_query_active", lambda: True)
    source = _make_source(tmp_path)
    try:
        result = dashboard_agent.run_auto_dashboard(source)
        # The template fallback (no Ollama involved) should still have run normally.
        assert len([s for s in result.steps if s.status == "ok"]) > 5
    finally:
        source.close()


def test_ask_data_question_tool_yields_when_manual_query_becomes_active_mid_run(tmp_path, monkeypatch):
    manual_active = {"value": False}
    monkeypatch.setattr(dashboard_agent, "manual_query_active", lambda: manual_active["value"])

    class _AgentThatTriggersMidRun:
        """The agent phase starts with no manual query running, but one kicks off (as if a
        user submitted a question) before the tool gets called."""

        def __init__(self, model, tools, system_prompt):
            self.tool = tools[0]

        def __call__(self, prompt: str, **kwargs):
            manual_active["value"] = True
            self.tool("total revenue")
            return "done"

    monkeypatch.setattr(dashboard_agent, "Agent", _AgentThatTriggersMidRun)
    monkeypatch.setattr(dashboard_agent, "answer_question", _fake_answer)
    source = _make_source(tmp_path)
    try:
        result = dashboard_agent.run_auto_dashboard(source)
        # The tool call should have been refused, so it never became a recorded step —
        # but the (Ollama-free) template fallback still filled the dashboard.
        assert all(s.question != "total revenue" for s in result.steps)
        assert len([s for s in result.steps if s.status == "ok"]) > 5
    finally:
        source.close()


def test_run_auto_dashboard_keeps_steps_captured_before_agent_error(tmp_path, monkeypatch):
    monkeypatch.setattr(dashboard_agent, "Agent", _FailingFakeAgent)
    monkeypatch.setattr(dashboard_agent, "answer_question", _fake_answer)
    source = _make_source(tmp_path)
    try:
        result = dashboard_agent.run_auto_dashboard(source)
        # 1 successful tool call before the agent errors out, then the template fallback
        # still runs normally on top of it.
        ok_steps = [s for s in result.steps if s.status == "ok"]
        assert len(ok_steps) > 1
    finally:
        source.close()


def test_everything_failing_is_recorded_for_both_agent_and_template_phases(monkeypatch):
    monkeypatch.setattr(dashboard_agent, "Agent", _FakeAgent)

    def _boom(source, question):
        raise dashboard_agent.PipelineError("nope")

    monkeypatch.setattr(dashboard_agent, "answer_question", _boom)
    source = _AlwaysFailsSource()
    result = dashboard_agent.run_auto_dashboard(source)
    assert len(result.steps) > 0
    assert all(step.status == "failed" for step in result.steps)
    assert all(step.answer is None for step in result.steps)
    assert len(result.steps) <= dashboard_agent.MAX_QUESTIONS
