from fastapi import APIRouter, HTTPException

from app.datasources import registry
from app.pipeline import dashboard_jobs
from app.pipeline.dashboard_jobs import DashboardJobStatus

router = APIRouter()


@router.post("/datasources/{source_id}/auto-dashboard")
def start_auto_dashboard(source_id: str) -> dict:
    try:
        source = registry.get(source_id)
    except registry.UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    job_id = dashboard_jobs.start_job(source)
    return {"job_id": job_id}


@router.get("/auto-dashboard/{job_id}")
def get_auto_dashboard_status(job_id: str) -> DashboardJobStatus:
    job = dashboard_jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown job")
    return job
