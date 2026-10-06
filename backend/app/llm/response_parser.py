import json
import re

from pydantic import BaseModel, ValidationError

from app.models import ChartSpec


class LLMQueryResponse(BaseModel):
    objective: str
    sql: str
    chart_hint: ChartSpec | None = None


class ResponseParseError(Exception):
    def __init__(self, message: str, raw_text: str):
        super().__init__(message)
        self.raw_text = raw_text


def _find_json_object(text: str) -> dict:
    """Parse the first complete JSON object in `text`, ignoring anything after it.

    Small local models sometimes follow the JSON with trailing commentary or even a second,
    malformed object. A greedy regex up to the *last* '}' in the text would swallow that
    junk and fail with "Extra data"; JSONDecoder.raw_decode stops at the first balanced
    object instead, so trailing noise is simply ignored."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    start = text.find("{")
    if start == -1:
        raise json.JSONDecodeError("No JSON object found in response", text, 0)
    obj, _ = json.JSONDecoder().raw_decode(text, start)
    return obj


_SQL_ALIASES = ("sql", "query", "sql_query", "sqlquery", "statement")
_OBJECTIVE_ALIASES = ("objective", "explanation", "description", "summary", "answer")
_CHART_ALIASES = ("chart_hint", "chart", "chart_spec")


def _normalize_keys(data: dict) -> dict:
    """Small local models sometimes ignore the exact key names the prompt asked for (e.g.
    "query" instead of "sql", or an "explanation" instead of "objective") even though the
    rest of the payload is perfectly usable — map the common variants onto the expected keys
    instead of failing the whole response over a naming mismatch."""
    if not isinstance(data, dict):
        return data
    lower_map = {k.lower(): k for k in data}

    def pick(aliases: tuple[str, ...]):
        for alias in aliases:
            if alias in lower_map:
                return data[lower_map[alias]]
        return None

    normalized = dict(data)
    if "sql" not in normalized:
        found = pick(_SQL_ALIASES)
        if found is not None:
            normalized["sql"] = found
    if "objective" not in normalized:
        found = pick(_OBJECTIVE_ALIASES)
        normalized["objective"] = found if found is not None else "Answer to your question"
    if "chart_hint" not in normalized:
        found = pick(_CHART_ALIASES)
        if found is not None:
            normalized["chart_hint"] = found
    # A small local model reliably struggles to produce the nested chart_hint object and
    # instead writes a plain description string (e.g. "A bar chart showing..."), or some
    # other shape that isn't a dict — that's a genuinely optional field (the query pipeline
    # already has a heuristic chart-picker for when no hint is given), so a malformed hint
    # is discarded here rather than failing the entire response and forcing a full retry
    # over a field that was never load-bearing to begin with.
    if not isinstance(normalized.get("chart_hint"), (dict, type(None))):
        normalized["chart_hint"] = None
    return normalized


def parse_llm_response(raw_text: str) -> LLMQueryResponse:
    try:
        data = _find_json_object(raw_text)
    except json.JSONDecodeError as exc:
        raise ResponseParseError(f"Could not parse JSON from LLM response: {exc}", raw_text) from exc
    try:
        return LLMQueryResponse.model_validate(_normalize_keys(data))
    except ValidationError as exc:
        raise ResponseParseError(f"LLM response JSON did not match expected schema: {exc}", raw_text) from exc
