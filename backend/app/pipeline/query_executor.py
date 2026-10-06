import re

from app.config import settings
from app.datasources.base import DataSource
from app.llm import ollama_client
from app.llm.prompt_builder import SYSTEM_PROMPT, build_user_prompt
from app.llm.query_validator import QueryValidationError, validate_and_prepare
from app.llm.response_parser import LLMQueryResponse, ResponseParseError, parse_llm_response
from app.llm.schema_filter import other_table_names, select_relevant_tables
from app.models import ChartSpec, QueryAnswer
from app.pipeline import measures_store, relationships_store
from app.pipeline.chart_selector import select_chart

MAX_SQL_ATTEMPTS = 3

_SPLIT_PATTERN = re.compile(r",\s*(?:and\s+)?|\s+and\s+", re.IGNORECASE)
# Two full questions typed back-to-back ("...products table? How many customers...") are just
# as compound as a single comma/"and"-joined one, but end in "?"/"." followed by more text
# rather than a conjunction — split on that sentence boundary first, then split each sentence
# the usual comma/"and" way.
_SENTENCE_SPLIT_PATTERN = re.compile(r"(?<=[?.])\s+(?=\S)")


class PipelineError(Exception):
    def __init__(self, message: str, raw_llm_text: str | None = None):
        super().__init__(message)
        self.raw_llm_text = raw_llm_text


def _chat_and_parse(system: str, user: str) -> tuple[LLMQueryResponse, str] | tuple[None, str]:
    """Call the model and try to parse its JSON response, retrying once with a stricter
    instruction if the first reply wasn't valid JSON. Returns (None, raw_text) — instead of
    raising — if both attempts fail to parse, so the caller can fold that into its own
    self-correction retry loop rather than aborting immediately."""
    raw_text = ollama_client.chat(system, user)
    try:
        return parse_llm_response(raw_text), raw_text
    except ResponseParseError:
        raw_text = ollama_client.chat(system, user + "\n\nReturn ONLY the JSON object, with no other text.")
        try:
            return parse_llm_response(raw_text), raw_text
        except ResponseParseError as exc:
            return None, exc.raw_text


def _answer_from_prompt(source: DataSource, schema, user_prompt: str) -> QueryAnswer:
    current_prompt = user_prompt
    last_error: str | None = None
    last_raw_text: str | None = None
    # Short (unqualified) names only — a generated query may reference a table either bare
    # ("customers") or fully qualified ("src_sql_xxx.public.customers"), and checking just the
    # tail catches a hallucinated name either way without needing to reconstruct the exact
    # qualification the model happened to use.
    valid_table_names = {t.name.rsplit(".", 1)[-1].lower() for t in schema.tables}

    for attempt in range(MAX_SQL_ATTEMPTS):
        llm_response, raw_text = _chat_and_parse(SYSTEM_PROMPT, current_prompt)
        last_raw_text = raw_text

        if llm_response is None:
            last_error = "The model's response wasn't valid JSON in the expected shape."
        else:
            try:
                safe_sql = validate_and_prepare(
                    llm_response.sql, schema.dialect, settings.max_result_rows, valid_table_names
                )
                result = source.execute_query(safe_sql, settings.query_timeout_s, settings.max_result_rows)
            except QueryValidationError as exc:
                last_error = f"Generated SQL failed safety validation: {exc}"
            except Exception as exc:
                last_error = f"Generated SQL failed to execute: {exc}"
            else:
                chart_spec = select_chart(result, llm_response.chart_hint)
                return QueryAnswer(
                    objective=llm_response.objective,
                    sql=safe_sql,
                    chart_spec=chart_spec,
                    result=result,
                    execution_ms=result.execution_ms,
                )

        if attempt + 1 < MAX_SQL_ATTEMPTS:
            if llm_response is None:
                # Give the model a chance to see its own malformed output and correct the
                # shape — far more effective than statically guessing every way a small
                # local model can mis-name a key (e.g. "query" instead of "sql"). A concrete
                # example of the exact chart_hint object shape is included here (not just in
                # the original prompt) because the most common repeat mistake, observed in
                # practice, is a small model writing chart_hint as a plain description
                # string ("A bar chart showing...") instead of the required nested object —
                # simply being told "wrong shape" a second time doesn't fix that, seeing the
                # literal shape again right next to its own mistake does.
                current_prompt = (
                    f"{user_prompt}\n\nYour previous response could not be parsed:\n{raw_text}\n\n"
                    f"Error: {last_error}\n\nReturn ONLY a single JSON object with exactly the keys "
                    '"objective", "sql", "chart_hint" — no markdown fences, no other keys, no '
                    'commentary. "sql" must be a non-null SQL string. "chart_hint" must be a JSON '
                    "object, never a plain text description — for example: "
                    '{"chart_type": "bar", "x_field": "month", "y_fields": ["total_revenue"], '
                    '"series_field": null, "title": "Monthly Revenue"}.'
                )
            else:
                # Give the model a chance to look at the real database error and fix its own
                # mistake — far more effective than trying to statically anticipate every way a
                # small local model can misreference a column, especially in multi-CTE queries.
                current_prompt = (
                    f"{user_prompt}\n\nYour previous answer's SQL failed:\n{llm_response.sql}\n\n"
                    f"Error: {last_error}\n\nFix the SQL and return the corrected JSON object "
                    "(same objective/sql/chart_hint keys). Re-check the schema above and make "
                    "sure every column you reference actually exists in the table or CTE you're "
                    "selecting it from — this is often a JOIN or column-name mistake."
                )

    raise PipelineError(last_error or "Query failed", raw_llm_text=last_raw_text)


def rerun_sql(
    source: DataSource, sql: str, dialect: str, objective: str, chart_spec: ChartSpec
) -> QueryAnswer:
    """Re-execute a known-good SQL string directly against the source, skipping the LLM
    entirely — used for a chart's live/real-time refresh (re-running its own stored SQL every
    few seconds would be far too slow and expensive to round-trip through the local model)
    and for what-if analysis (the SQL has already been rewritten client-side with a
    substituted literal; only the numbers should change, not the chart's shape/labels, so the
    same chart_spec/objective are kept)."""
    safe_sql = validate_and_prepare(sql, dialect, settings.max_result_rows)
    result = source.execute_query(safe_sql, settings.query_timeout_s, settings.max_result_rows)
    return QueryAnswer(
        objective=objective, sql=safe_sql, chart_spec=chart_spec, result=result, execution_ms=result.execution_ms
    )


def _answer_single_question(source: DataSource, question: str) -> QueryAnswer:
    schema = source.get_schema()
    trimmed = select_relevant_tables(schema, question)
    sample_rows = {t.name: source.get_sample_rows(t.name, n=5) for t in trimmed.tables}
    others = other_table_names(schema, trimmed)
    measures = measures_store.list_measures(source.id())
    relationships = relationships_store.list_relationships(source.id())
    user_prompt = build_user_prompt(
        trimmed, sample_rows, question, other_table_names=others, custom_measures=measures,
        known_relationships=relationships,
    )
    return _answer_from_prompt(source, schema, user_prompt)


def modify_question(
    source: DataSource, question: str, previous_sql: str, previous_objective: str, instruction: str
) -> QueryAnswer:
    """Regenerate an existing chart's query given a natural-language follow-up instruction
    (e.g. "make this a pie chart", "only show the last 6 months"), instead of asking the
    user to start a brand new question from scratch."""
    schema = source.get_schema()
    trimmed = select_relevant_tables(schema, question)
    sample_rows = {t.name: source.get_sample_rows(t.name, n=5) for t in trimmed.tables}
    others = other_table_names(schema, trimmed)
    measures = measures_store.list_measures(source.id())
    relationships = relationships_store.list_relationships(source.id())
    base_prompt = build_user_prompt(
        trimmed, sample_rows, question, other_table_names=others, custom_measures=measures,
        known_relationships=relationships,
    )
    modify_prompt = (
        f"{base_prompt}\n\nYou previously answered this question with:\n"
        f"Objective: {previous_objective}\nSQL: {previous_sql}\n\n"
        f"The user now wants this change: \"{instruction}\"\n\n"
        "Return the updated JSON object (same objective/sql/chart_hint keys) reflecting "
        "this change, still following every rule above."
    )
    return _answer_from_prompt(source, schema, modify_prompt)


def _split_compound_question(question: str) -> list[str]:
    """Split a question into its separate asks — either "...revenue trends, top restaurants,
    and customer behavior" (comma/"and"-joined within one sentence) or two full questions
    typed back-to-back, e.g. "What's the average price by category? How many customers are
    there?" (sentence boundary, no conjunction at all). A small local model asked to answer
    several unrelated things in one SQL query overwhelmingly reaches for a JOIN across
    independent aggregates — which rarely has a real shared key — no matter how the prompt
    tries to steer it away from that. Answering each part on its own is far more reliable
    than continuing to hope a single query will work."""
    sentences = [s.strip() for s in _SENTENCE_SPLIT_PATTERN.split(question) if s.strip()]
    parts = [p.strip(" .") for s in sentences for p in _SPLIT_PATTERN.split(s) if p.strip(" .")]
    return parts if len(parts) > 1 else [question]


def answer_question(source: DataSource, question: str) -> QueryAnswer:
    """Answer a question, automatically splitting it into separate parts and answering each
    one individually if the single combined query fails — most often because the question
    asked for several unrelated things at once. The first successful part becomes the
    primary answer; any further successful parts are attached as `extra_answers`."""
    try:
        return _answer_single_question(source, question)
    except PipelineError as original_error:
        parts = _split_compound_question(question)
        if len(parts) < 2:
            raise

        answers: list[QueryAnswer] = []
        for part in parts:
            try:
                answers.append(_answer_single_question(source, part))
            except PipelineError:
                continue

        if not answers:
            raise original_error

        primary, *rest = answers
        primary.extra_answers = rest
        return primary
