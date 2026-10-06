import json
import logging
from typing import Protocol

from app.llm import ollama_client
from app.llm.ollama_client import OllamaError
from app.pipeline.bi_analyst.models import BusinessSignal, RecommendedQuestion

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior business intelligence analyst.

Your job is to explain, in one sharp sentence each, why a given analytical question matters
to a business decision-maker. Think in terms of growth, risk, opportunity, profitability,
and what action the answer would unlock. Be specific to the business context given, not
generic. Never invent numbers or facts not present in the context you're given."""


class LLMProvider(Protocol):
    """Anything with this shape can enrich question rationales — swap in a Claude or OpenAI
    client later without touching `enrich_rationales` itself."""

    def chat(self, system: str, user: str) -> str: ...


class OllamaProvider:
    """Default provider, backed by the app's existing local Ollama instance."""

    def chat(self, system: str, user: str) -> str:
        return ollama_client.chat(system, user)


def enrich_rationales(
    questions: list[RecommendedQuestion],
    signals: list[BusinessSignal],
    domain: str,
    top_n: int = 12,
    provider: LLMProvider | None = None,
) -> None:
    """Best-effort: ask the LLM for a sharper, dataset-specific "why it matters" for the
    highest-priority questions, replacing the deterministic template rationale in place.
    Every question already carries a correct, if generic, rationale before this runs, so any
    failure here (model unreachable, malformed JSON) simply leaves that text untouched
    rather than degrading the response."""
    provider = provider or OllamaProvider()
    top_questions = questions[:top_n]
    if not top_questions:
        return

    payload = {
        "domain": domain,
        "signals": [s.description for s in signals],
        "questions": [{"id": i, "question": q.question, "category": q.category} for i, q in enumerate(top_questions)],
    }
    user_prompt = (
        "Given this business context and list of analytical questions, write a sharp, "
        "one-sentence business rationale for each — why a decision-maker should care.\n"
        'Return ONLY a JSON array of {"id": <int>, "why_it_matters": <string>} objects, '
        "one per question, no other text.\n\n" + json.dumps(payload)
    )
    try:
        raw = provider.chat(SYSTEM_PROMPT, user_prompt)
        rationales = _parse_rationales(raw)
    except (OllamaError, ValueError):
        logger.info("LLM rationale enrichment unavailable; keeping template rationales")
        return

    for entry in rationales:
        idx = entry.get("id")
        text = entry.get("why_it_matters")
        if isinstance(idx, int) and 0 <= idx < len(top_questions) and isinstance(text, str) and text.strip():
            top_questions[idx].why_it_matters = text.strip()


def _parse_rationales(raw_text: str) -> list[dict]:
    start = raw_text.find("[")
    if start == -1:
        raise ValueError("No JSON array found in LLM response")
    data, _ = json.JSONDecoder().raw_decode(raw_text, start)
    if not isinstance(data, list):
        raise ValueError("Expected a JSON array")
    return data
