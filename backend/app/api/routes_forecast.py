from fastapi import APIRouter, HTTPException, Query

from app.datasources import registry
from app.models import ForecastResponse
from app.pipeline.forecast import ForecastError, build_forecast

router = APIRouter()


@router.get("/datasources/{source_id}/forecast")
def get_forecast(
    source_id: str,
    value_field: str | None = None,
    periods: int = Query(3, ge=1, le=12),
) -> ForecastResponse:
    try:
        source = registry.get(source_id)
    except registry.UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        return build_forecast(source, value_field, periods)
    except ForecastError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
