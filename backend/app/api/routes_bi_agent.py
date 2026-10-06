from fastapi import APIRouter, HTTPException

from app.datasources import registry
from app.llm.ollama_client import OllamaError
from app.pipeline.bi_analyst.models import BIAnalysisResult
from app.pipeline.bi_analyst.orchestrator import run_bi_analysis

router = APIRouter()


@router.post("/bi-agent/{source_id}/analyze")
def analyze(source_id: str, enrich: bool = True) -> BIAnalysisResult:
    """`enrich=false` skips the single LLM call that rewrites the top questions' rationale
    into a sharper, dataset-specific sentence — local LLM inference for that one call
    typically takes several seconds, which is fine for the dedicated AI Business Analyst
    page but too slow for a quick suggestions list inside another modal. Every question
    already has a correct, if more generic, template rationale without it."""
    try:
        source = registry.get(source_id)
    except registry.UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        return run_bi_analysis(source, enrich_with_llm=enrich)
    except OllamaError as exc:
        # The core pipeline (profiling/signals/questions) is fully deterministic and doesn't
        # need the LLM at all — this can only be raised by the optional rationale-enrichment
        # step if it somehow escapes its own error handling. Treat it the same as any other
        # LLM-unavailable case elsewhere in the app rather than failing the whole analysis.
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"BI analysis failed: {exc}") from exc
