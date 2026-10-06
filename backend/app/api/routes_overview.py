from fastapi import APIRouter, HTTPException

from app.datasources import registry
from app.models import OverviewResponse
from app.pipeline.overview import build_overview

router = APIRouter()


@router.get("/datasources/{source_id}/overview")
def get_overview(
    source_id: str,
    category: str | None = None,
    year: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> OverviewResponse:
    try:
        source = registry.get(source_id)
    except registry.UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return build_overview(
        source,
        category_filter=category,
        year_filter=year,
        date_from=date_from,
        date_to=date_to,
    )
