import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.datasources import registry
from app.llm.query_validator import QueryValidationError, validate_expression
from app.models import CustomMeasure, MeasureFormat
from app.pipeline import measures_store as store

router = APIRouter()


class CreateMeasureRequest(BaseModel):
    name: str
    expression: str
    description: str | None = None
    format: MeasureFormat = "number"


@router.get("/sources/{source_id}/measures")
def list_measures(source_id: str) -> list[CustomMeasure]:
    return store.list_measures(source_id)


@router.post("/sources/{source_id}/measures")
def create_measure(source_id: str, req: CreateMeasureRequest) -> CustomMeasure:
    try:
        source = registry.get(source_id)
    except registry.UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if not req.name.strip():
        raise HTTPException(status_code=422, detail="Measure name cannot be empty.")

    try:
        validate_expression(req.expression, source.get_schema().dialect)
    except QueryValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid measure expression: {exc}") from exc

    return store.create_measure(
        str(uuid.uuid4()), source_id, req.name, req.expression, req.description, req.format
    )


@router.delete("/sources/{source_id}/measures/{measure_id}")
def delete_measure(source_id: str, measure_id: str) -> dict:
    try:
        store.delete_measure(measure_id)
    except store.MeasureNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"deleted": True}
