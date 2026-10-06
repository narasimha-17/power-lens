from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.datasources import registry
from app.llm.ollama_client import OllamaError
from app.llm.ollama_priority import ManualQueryGuard
from app.llm.query_validator import QueryValidationError
from app.models import ChartSpec
from app.pipeline.query_executor import PipelineError, QueryAnswer, answer_question, modify_question, rerun_sql

router = APIRouter()


class QueryRequest(BaseModel):
    source_id: str
    question: str


class ModifyQueryRequest(BaseModel):
    source_id: str
    question: str
    previous_sql: str
    previous_objective: str
    instruction: str


class RerunQueryRequest(BaseModel):
    source_id: str
    sql: str
    objective: str
    chart_spec: ChartSpec


@router.post("/query")
def run_query(req: QueryRequest) -> QueryAnswer:
    try:
        source = registry.get(req.source_id)
    except registry.UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        with ManualQueryGuard():
            return answer_question(source, req.question)
    except OllamaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PipelineError as exc:
        raise HTTPException(
            status_code=422,
            detail={"message": str(exc), "raw_llm_text": exc.raw_llm_text},
        ) from exc


@router.post("/query/rerun")
def rerun_query(req: RerunQueryRequest) -> QueryAnswer:
    """Re-executes an already-known-good SQL string with no LLM call involved — powers a
    dashboard chart's "live" polling refresh and what-if analysis's substituted-literal
    re-runs, both of which need to stay fast and cheap enough to fire every few seconds."""
    try:
        source = registry.get(req.source_id)
    except registry.UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    schema = source.get_schema()
    try:
        return rerun_sql(source, req.sql, schema.dialect, req.objective, req.chart_spec)
    except QueryValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Generated SQL failed safety validation: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Query failed to execute: {exc}") from exc


@router.post("/query/modify")
def modify_query(req: ModifyQueryRequest) -> QueryAnswer:
    try:
        source = registry.get(req.source_id)
    except registry.UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        with ManualQueryGuard():
            return modify_question(
                source, req.question, req.previous_sql, req.previous_objective, req.instruction
            )
    except OllamaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PipelineError as exc:
        raise HTTPException(
            status_code=422,
            detail={"message": str(exc), "raw_llm_text": exc.raw_llm_text},
        ) from exc
