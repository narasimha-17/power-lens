import re

from pydantic import BaseModel
from strands import Agent, tool
from strands.models.ollama import OllamaModel

from app.config import settings
from app.datasources.base import DataSource
from app.llm.ollama_client import OllamaError
from app.llm.ollama_priority import manual_query_active
from app.llm.query_validator import validate_and_prepare
from app.models import ChartSpec
from app.pipeline.chart_selector import select_chart
from app.pipeline.measures import is_identifier_like, is_measure
from app.pipeline.query_executor import PipelineError, QueryAnswer, answer_question

MIN_CHARTS = 20
MAX_QUESTIONS = 28
AGENT_TURNS = 6


class AgentStep(BaseModel):
    question: str
    status: str  # "ok" | "failed"
    answer: QueryAnswer | None = None
    error: str | None = None


class AutoDashboardResult(BaseModel):
    dashboard_name: str
    steps: list[AgentStep]


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _safe_ident(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]", "_", name)


def _q(name: str) -> str:
    return f'"{name}"'


def _q_table(name: str) -> str:
    """Quote a table name for use in FROM/JOIN. Unlike a plain column name, a table name from
    an attached SQL source (SqlSource) is a fully-qualified "catalog.schema.table" string —
    wrapping the whole thing in one pair of quotes would make DuckDB look for a single
    identifier literally containing dots, instead of the catalog/schema/table triple. Each
    dot-separated part needs its own quotes."""
    return ".".join(f'"{part}"' for part in name.split("."))


def _describe_schema(source: DataSource) -> str:
    schema = source.get_schema()
    lines = []
    for table in schema.tables:
        cols = ", ".join(f"{c.name} ({c.type})" for c in table.columns)
        lines.append(f"- Table {table.name}: {cols}")
    return "\n".join(lines)


def _fallback_templates(source: DataSource) -> list[tuple[str, str, ChartSpec | None]]:
    """Schema-driven (question, sql, chart_hint) templates used to reliably fill a large
    dashboard out to MIN_CHARTS. Bypasses the LLM entirely for SQL generation — a 3B local
    model asked to write 20+ queries in a row is slow and unreliable, and these are simple
    enough to build deterministically from the schema. Still routed through the same safety
    validator and chart-selection heuristic as every other query, and still real, freshly
    executed numbers — only the SQL authorship is templated, not the data.

    Ordered so only a handful of plain single-number KPIs appear before the rest — trends,
    breakdowns, and cross-tabs — so a big auto-generated dashboard isn't just a wall of KPI
    cards."""
    schema = source.get_schema()
    table = schema.tables[0].name
    columns = schema.tables[0].columns
    numeric = [c.name for c in columns if c.type == "numeric"]
    datetimes = [c.name for c in columns if c.type == "datetime"]
    categoricals = [c.name for c in columns if c.type == "categorical"]
    # "Measures" are the subset of numeric columns worth summing/trending (revenue, quantity,
    # ...) — id/age/rating/year/... shouldn't be added up or plotted as a business trend, but
    # age/rating/year are still fine to show as an average, a distribution, or a relationship.
    # "analyzable" additionally drops pure identifiers/codes (id, zip, lat/lon, phone) that
    # carry no numeric meaning at all — "distribution of id" is never a real question.
    measures = [c for c in numeric if is_measure(c)]
    analyzable = [c for c in numeric if not is_identifier_like(c)]

    templates: list[tuple[str, str, ChartSpec | None]] = []

    for metric in measures[:2]:
        alias = f"total_{_safe_ident(metric)}"
        templates.append((
            f"What is the total {metric}?",
            f"SELECT SUM({_q(metric)}) AS {alias} FROM {_q_table(table)}",
            ChartSpec(chart_type="kpi", y_fields=[alias], title=f"Total {metric}"),
        ))
    templates.append((
        "How many total records are there?",
        f"SELECT COUNT(*) AS total_records FROM {_q_table(table)}",
        ChartSpec(chart_type="kpi", y_fields=["total_records"], title="Total Records"),
    ))
    # A Power BI overview page always opens with at least 3 headline stat cards — the two
    # above alone (or even just one, for a dataset with only a single summable measure)
    # leave a thin, awkward-looking first row. Round out to a third and fourth distinct
    # single-number stat rather than stopping short.
    if measures:
        first_measure = measures[0]
        avg_alias = f"avg_{_safe_ident(first_measure)}"
        templates.append((
            f"What is the average {first_measure}?",
            f"SELECT AVG({_q(first_measure)}) AS {avg_alias} FROM {_q_table(table)}",
            ChartSpec(chart_type="kpi", y_fields=[avg_alias], title=f"Average {first_measure}"),
        ))
    if categoricals:
        first_cat = categoricals[0]
        distinct_alias = f"distinct_{_safe_ident(first_cat)}"
        templates.append((
            f"How many distinct {first_cat} are there?",
            f"SELECT COUNT(DISTINCT {_q(first_cat)}) AS {distinct_alias} FROM {_q_table(table)}",
            ChartSpec(chart_type="kpi", y_fields=[distinct_alias], title=f"Distinct {first_cat}"),
        ))

    for trend_idx, metric in enumerate(measures):
        for dt in datetimes:
            alias = f"total_{_safe_ident(metric)}"
            # Alternate line/area for trend charts so a big dashboard doesn't just show
            # the same trend shape rendered the same way every time.
            trend_type = "line" if trend_idx % 2 == 0 else "area"
            templates.append((
                f"What is the trend of total {metric} over {dt}?",
                f"SELECT {_q(dt)} AS {_safe_ident(dt)}, SUM({_q(metric)}) AS {alias} "
                f"FROM {_q_table(table)} GROUP BY {_q(dt)} ORDER BY {_q(dt)}",
                ChartSpec(chart_type=trend_type, x_field=_safe_ident(dt), y_fields=[alias], title=f"{metric} Trend"),
            ))

    # Multi-line trends: same metric-over-time, split into one line per category — genuine
    # multi-series line charts, not just single lines.
    if categoricals:
        series_cat = categoricals[0]
        for metric in measures:
            for dt in datetimes:
                alias = f"total_{_safe_ident(metric)}"
                templates.append((
                    f"What is the trend of total {metric} over {dt}, split by {series_cat}?",
                    f"SELECT {_q(dt)} AS {_safe_ident(dt)}, {_q(series_cat)} AS {_safe_ident(series_cat)}, "
                    f"SUM({_q(metric)}) AS {alias} FROM {_q_table(table)} "
                    f"GROUP BY {_q(dt)}, {_q(series_cat)} ORDER BY {_q(dt)} LIMIT 500",
                    ChartSpec(
                        chart_type="line", x_field=_safe_ident(dt), y_fields=[alias],
                        series_field=_safe_ident(series_cat), title=f"{metric} Trend by {series_cat}",
                    ),
                ))

    # A bar/column chart and a pie/donut chart are mandatory in every dashboard that has at
    # least one measure and one category — guaranteed up front rather than left to chance,
    # since the alternating assignment below could in principle skip one of them.
    if measures and categoricals:
        m, cat = measures[0], categoricals[0]
        alias = f"total_{_safe_ident(m)}"
        sql = (
            f"SELECT {_q(cat)} AS {_safe_ident(cat)}, SUM({_q(m)}) AS {alias} "
            f"FROM {_q_table(table)} GROUP BY {_q(cat)} ORDER BY {alias} DESC"
        )
        templates.append((
            f"What is the total {m} broken down by {cat}?", sql,
            ChartSpec(chart_type="bar", x_field=_safe_ident(cat), y_fields=[alias], title=f"{m} by {cat}"),
        ))
        templates.append((
            f"How is total {m} distributed across {cat}?", sql,
            ChartSpec(chart_type="pie", x_field=_safe_ident(cat), y_fields=[alias], title=f"{m} Share by {cat}"),
        ))

    # Breakdowns: alternate bar/pie (donut) across every (metric, category, aggregate) combo
    # so a big dashboard actually mixes chart types instead of defaulting to all-bar.
    breakdown_idx = 0

    def _next_breakdown_type() -> str:
        nonlocal breakdown_idx
        breakdown_idx += 1
        return "bar" if breakdown_idx % 2 else "pie"

    for metric in measures:
        for cat in categoricals:
            alias = f"total_{_safe_ident(metric)}"
            templates.append((
                f"What is the total {metric} broken down by {cat}?",
                f"SELECT {_q(cat)} AS {_safe_ident(cat)}, SUM({_q(metric)}) AS {alias} "
                f"FROM {_q_table(table)} GROUP BY {_q(cat)} ORDER BY {alias} DESC",
                ChartSpec(chart_type=_next_breakdown_type(), x_field=_safe_ident(cat), y_fields=[alias], title=f"{metric} by {cat}"),
            ))

    for cat in categoricals:
        templates.append((
            f"What is the count of records broken down by {cat}?",
            f"SELECT {_q(cat)} AS {_safe_ident(cat)}, COUNT(*) AS record_count "
            f"FROM {_q_table(table)} GROUP BY {_q(cat)} ORDER BY record_count DESC",
            ChartSpec(chart_type=_next_breakdown_type(), x_field=_safe_ident(cat), y_fields=["record_count"], title=f"Record Count by {cat}"),
        ))

    for metric in analyzable:
        for cat in categoricals:
            alias = f"avg_{_safe_ident(metric)}"
            templates.append((
                f"What is the average {metric} by {cat}?",
                f"SELECT {_q(cat)} AS {_safe_ident(cat)}, AVG({_q(metric)}) AS {alias} "
                f"FROM {_q_table(table)} GROUP BY {_q(cat)} ORDER BY {alias} DESC",
                ChartSpec(chart_type=_next_breakdown_type(), x_field=_safe_ident(cat), y_fields=[alias], title=f"Average {metric} by {cat}"),
            ))

    for metric in measures:
        for cat in categoricals:
            alias = f"max_{_safe_ident(metric)}"
            templates.append((
                f"What is the highest {metric} by {cat}?",
                f"SELECT {_q(cat)} AS {_safe_ident(cat)}, MAX({_q(metric)}) AS {alias} "
                f"FROM {_q_table(table)} GROUP BY {_q(cat)} ORDER BY {alias} DESC",
                ChartSpec(chart_type=_next_breakdown_type(), x_field=_safe_ident(cat), y_fields=[alias], title=f"Highest {metric} by {cat}"),
            ))

    # Cross-tabs: grouped bar and multi-line, one metric split across two categoricals.
    for i, cat1 in enumerate(categoricals):
        for cat2 in categoricals[i + 1:]:
            for metric in measures[:1]:
                alias = f"total_{_safe_ident(metric)}"
                sql = (
                    f"SELECT {_q(cat1)} AS {_safe_ident(cat1)}, {_q(cat2)} AS {_safe_ident(cat2)}, "
                    f"SUM({_q(metric)}) AS {alias} FROM {_q_table(table)} "
                    f"GROUP BY {_q(cat1)}, {_q(cat2)} ORDER BY {alias} DESC LIMIT 200"
                )
                cross_chart_type = ["bar", "line", "stacked_bar"][breakdown_idx % 3]
                breakdown_idx += 1
                templates.append((
                    f"What is the total {metric} broken down by {cat1} and {cat2}?",
                    sql,
                    ChartSpec(
                        chart_type=cross_chart_type, x_field=_safe_ident(cat1), y_fields=[alias],
                        series_field=_safe_ident(cat2), title=f"{metric} by {cat1} and {cat2}",
                    ),
                ))

    # Correlation between two numeric measures, and the raw distribution of a metric —
    # covers the "distribution/relationship" chart family, not just comparison/trend.
    if len(analyzable) >= 2:
        m1, m2 = analyzable[0], analyzable[1]
        templates.append((
            f"What is the relationship between {m1} and {m2}?",
            f"SELECT {_q(m1)} AS {_safe_ident(m1)}, {_q(m2)} AS {_safe_ident(m2)} "
            f"FROM {_q_table(table)} LIMIT 300",
            ChartSpec(chart_type="scatter", x_field=_safe_ident(m1), y_fields=[_safe_ident(m2)], title=f"{m2} vs {m1}"),
        ))

    if analyzable:
        metric = analyzable[0]
        templates.append((
            f"What is the distribution of {metric}?",
            f"SELECT {_q(metric)} AS {_safe_ident(metric)} FROM {_q_table(table)} LIMIT 500",
            ChartSpec(chart_type="histogram", x_field=_safe_ident(metric), y_fields=[_safe_ident(metric)], title=f"Distribution of {metric}"),
        ))

    return templates


def run_auto_dashboard(source: DataSource) -> AutoDashboardResult:
    """Build a large, varied overview dashboard for a freshly connected dataset.

    An LLM-driven ReAct agent runs first and picks a small, well-reasoned starting set of
    questions (the same safe question -> SQL -> chart pipeline used for manual questions).
    Then schema-driven templates — real queries, just not LLM-authored — reliably top the
    dashboard up to MIN_CHARTS with varied chart types (trends, breakdowns, cross-tabs), since
    asking a small local model to write 20+ queries one at a time is far too slow and
    unreliable to be the only source of volume."""
    steps: list[AgentStep] = []
    asked_keys: set[str] = set()

    def _record(question: str, outcome: QueryAnswer | Exception) -> bool:
        key = _normalize(question)
        asked_keys.add(key)
        if isinstance(outcome, Exception):
            steps.append(AgentStep(question=question, status="failed", error=str(outcome)))
            return False
        asked_keys.add(_normalize(outcome.objective))
        steps.append(AgentStep(question=question, status="ok", answer=outcome))
        return True

    def _try_ask(question: str) -> bool:
        key = _normalize(question)
        if key in asked_keys or len(steps) >= MAX_QUESTIONS:
            return False
        try:
            answer = answer_question(source, question)
        except (PipelineError, OllamaError) as exc:
            return _record(question, exc)
        return _record(question, answer)

    def _try_ask_template(question: str, sql: str, chart_hint: ChartSpec | None) -> bool:
        key = _normalize(question)
        if key in asked_keys or len(steps) >= MAX_QUESTIONS:
            return False
        try:
            schema = source.get_schema()
            safe_sql = validate_and_prepare(sql, schema.dialect, settings.max_result_rows)
            result = source.execute_query(safe_sql, settings.query_timeout_s, settings.max_result_rows)
            chart_spec = select_chart(result, chart_hint)
            answer = QueryAnswer(
                objective=question, sql=safe_sql, chart_spec=chart_spec, result=result,
                execution_ms=result.execution_ms,
            )
        except Exception as exc:
            return _record(question, exc)
        return _record(question, answer)

    @tool
    def ask_data_question(question: str) -> str:
        """Ask one analytical question about the connected dataset and get back a
        chart-ready answer, computed for real against the live data.

        Use this once per distinct thing you want on the dashboard: a headline total,
        a trend over time, a breakdown by category, etc. Keep each question simple and
        answerable with a single aggregate SQL query. Never ask a question equivalent to
        one you've already asked in this session.
        """
        if manual_query_active():
            # A live user question is in flight right now on the one shared local Ollama
            # server — never queue another background call behind it. Fail this tool call
            # immediately so the agent phase winds down and the (Ollama-free) template
            # fallback takes over instead.
            raise RuntimeError("A live user question just started — yielding to it immediately.")
        key = _normalize(question)
        if key in asked_keys:
            return (
                "You already asked an equivalent question and got an answer for it. "
                "Ask something genuinely different, or stop calling this tool and finish."
            )
        if len(steps) >= MAX_QUESTIONS:
            return "Question budget reached — stop calling this tool and finish your summary."
        if not _try_ask(question):
            return f"That question failed ({steps[-1].error}). Try a different question, or move on."
        answer = steps[-1].answer
        assert answer is not None
        return (
            f"Got it: \"{answer.objective}\" -> {answer.result.row_count} row(s), "
            f"rendered as a {answer.chart_spec.chart_type} chart."
        )

    if manual_query_active():
        # A manual query is already running as this job starts — skip the LLM-driven agent
        # phase entirely and go straight to the template fallback, which never touches
        # Ollama at all. No point starting a multi-turn background conversation that would
        # just have to fight the user's own question for the same local model.
        pass
    else:
        model = OllamaModel(
            host=settings.ollama_host,
            model_id=settings.ollama_model,
            temperature=0.1,
            # A small local model at low temperature can lock onto repeating the same
            # phrase forever once it starts (seen in practice: "Active Vendors: Count of
            # active vendors." repeated hundreds of times) — repeat_penalty discourages
            # reusing recent tokens, and max_tokens caps the worst case even if it still
            # loops, so one bad generation can't stall the whole background job.
            max_tokens=800,
            options={"repeat_penalty": 1.3, "repeat_last_n": 256},
        )
        agent = Agent(
            model=model,
            tools=[ask_data_question],
            system_prompt=(
                "You are an expert Business Intelligence and Data Analysis Agent responsible for "
                "creating the first analytical overview of a newly connected dataset. Your role is "
                "to think like a senior business analyst, BI analyst, and Power BI dashboard "
                "designer rather than simply querying columns mechanically. First understand the "
                "dataset's structure, semantic meaning, business domain, available metrics, "
                "dimensions, identifiers, categorical fields, and date or datetime fields. Determine "
                "what the data actually represents and what meaningful business questions can be "
                "answered from it. Never assume that the dataset is sales data or that metrics such "
                "as revenue, profit, targets, customers, products, or regions exist unless they are "
                "actually present or can be reliably derived from the available data.\n\n"
                "Your objective is to identify the small set of highest-value questions that a "
                "business user would want answered when opening this dataset for the first time. "
                "Think from an executive and decision-making perspective: What is the overall "
                "business performance? What are the most important headline metrics? Is performance "
                "increasing or declining? What are the major contributors to performance? Which "
                "products, categories, regions, customers, departments, channels, or other business "
                "segments are performing strongly or poorly? Are there meaningful changes, gaps, "
                "trends, concentrations, or anomalies that deserve attention? Prioritize questions "
                "that reveal performance, growth, trends, comparisons, contribution, profitability, "
                "targets versus actuals, customer behavior, product performance, regional "
                "performance, risks, opportunities, or other decision-relevant patterns supported by "
                "the dataset.\n\n"
                "When a suitable date or datetime field exists, include a meaningful time-based "
                "analysis such as monthly, weekly, quarterly, or yearly trends depending on the "
                "available date range and data granularity. When meaningful categorical dimensions "
                "exist, include a useful breakdown such as revenue by region, sales by category, "
                "orders by channel, customers by segment, or another dimension that provides genuine "
                "business value. Select one or two headline metrics that best represent the scale or "
                "performance of the dataset rather than treating every numeric column as a KPI. "
                "Distinguish real measures from identifiers; for example, customer IDs, order IDs, "
                "and product IDs should not automatically be aggregated as business metrics. Use "
                "appropriate aggregations for each metric and avoid blindly summing percentages, "
                "identifiers, or other fields where that would be analytically incorrect.\n\n"
                "You have access to the ask_data_question tool. Use this tool to obtain factual "
                "analytical results from the connected dataset. Before every tool call, determine "
                "what important business information is still missing, whether the proposed "
                "question is supported by the available data, whether it provides a genuinely "
                "different analytical angle, and whether the result would materially improve the "
                "initial overview. Normally make approximately 4-8 tool calls, but stop earlier if "
                "the dataset is simple or the overview is already sufficiently understood. Every "
                "call must explore a genuinely different question; never repeat, rephrase, or ask a "
                "semantically equivalent version of a previous question. For example, \"Which region "
                "has the highest sales?\", \"Which region generates the most revenue?\", and \"What "
                "region has the largest sales amount?\" should be treated as the same question when "
                "sales and revenue represent the same measure. Instead, diversify the analysis "
                "across overall performance, profitability, time trends, categorical contribution, "
                "regional performance, customer behavior, product performance, target achievement, "
                "or other relevant dimensions.\n\n"
                "Use adaptive reasoning rather than a fixed question template. A sales dataset may "
                "require revenue, profit, product, customer, regional, and target analysis, while an "
                "HR dataset may require headcount, department, compensation, performance, and "
                "attrition analysis, and an inventory dataset may require stock, demand, turnover, "
                "supplier, warehouse, and product analysis. The questions must therefore be "
                "determined dynamically from the dataset's actual semantic structure and business "
                "context. Do not generate questions merely because a corresponding column exists. A "
                "question should have a clear analytical purpose and should help a business user "
                "understand what happened, where it happened, what contributed to it, what is "
                "changing, what requires attention, or where an opportunity may exist.\n\n"
                "Look for meaningful business signals while performing the analysis, including "
                "growth or decline, high-revenue/low-profit situations, margin compression, "
                "unusually strong or weak segments, customer or product concentration, target gaps, "
                "sudden increases or decreases, and other patterns that can be reliably identified "
                "from the data. Do not make unsupported causal claims. If the data shows that two "
                "variables move together, describe the relationship or association rather than "
                "claiming that one caused the other unless causal evidence is explicitly available. "
                "Similarly, do not infer business explanations that are not supported by the "
                "dataset.\n\n"
                "Data quality must be considered before relying on results. Be aware of missing "
                "values, duplicate records, invalid dates, inconsistent categories, unusual values, "
                "incorrect data types, and other issues that may affect the reliability of an "
                "analysis. If a required field does not exist or the available data cannot support a "
                "particular analysis, do not ask that question. Never fabricate or estimate missing "
                "metrics, values, targets, dates, benchmarks, or business facts. You must only "
                "report numerical results that are explicitly returned by ask_data_question or "
                "another trusted data-analysis tool. Do not invent numbers, approximate numbers, or "
                "present assumptions as facts.\n\n"
                "Think of the resulting analysis as the analytical foundation for a Power BI-style "
                "executive overview page. The initial overview should generally contain one or two "
                "important headline metrics, a meaningful time trend when possible, a useful "
                "categorical breakdown when possible, and a small number of additional high-value "
                "analyses that provide complementary business perspectives. The objective is not to "
                "exhaustively analyze every aspect of the dataset because additional charts and "
                "deeper analyses will be generated automatically afterward. Optimize for maximum "
                "business understanding with minimum redundancy.\n\n"
                "Once you have made enough successful analytical calls and have sufficient "
                "information to establish the initial business overview, stop calling tools. Your "
                "final response must be concise and consist of a single business-oriented sentence "
                "summarizing the most important finding or overall state of the dataset. The "
                "sentence must be based exclusively on factual results returned by the tools and "
                "must not introduce any numbers, assumptions, explanations, or conclusions that were "
                "not supported by the analysis. The core principle is: understand the data first, "
                "think like a business decision-maker, identify what matters most, ask distinct "
                "high-value questions, use only evidence from the dataset, and stop once the first "
                "meaningful BI overview has been established."            ),
        )
        try:
            # A hard cap on event-loop turns, independent of the tool's own budget check — a
            # small local model doesn't reliably stop calling the tool just because it was
            # told "budget reached" in the tool's text response, and every extra turn is a
            # full round trip to the (single, shared) local Ollama server that a live user
            # request would otherwise be waiting on.
            agent(
                f"Dataset schema:\n{_describe_schema(source)}\n\nBuild the overview dashboard now.",
                limits={"turns": AGENT_TURNS},
            )
        except Exception:
            pass  # any steps captured before the failure are still useful

    for question, sql, chart_hint in _fallback_templates(source):
        if sum(1 for s in steps if s.status == "ok") >= MIN_CHARTS:
            break
        _try_ask_template(question, sql, chart_hint)

    dashboard_name = f"{source.name()} Overview"
    return AutoDashboardResult(dashboard_name=dashboard_name, steps=steps)
