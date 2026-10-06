import threading
import uuid
from typing import Literal

from pydantic import BaseModel

from app.datasources.base import DataSource
from app.pipeline.dashboard_agent import AutoDashboardResult, run_auto_dashboard

_jobs: dict[str, "DashboardJobStatus"] = {}
_lock = threading.Lock()


class DashboardJobStatus(BaseModel):
    job_id: str
    status: Literal["running", "done", "error"]
    result: AutoDashboardResult | None = None
    error: str | None = None


def start_job(source: DataSource) -> str:
    job_id = uuid.uuid4().hex[:12]
    with _lock:
        _jobs[job_id] = DashboardJobStatus(job_id=job_id, status="running")
    thread = threading.Thread(target=_run, args=(job_id, source), daemon=True)
    thread.start()
    return job_id


def _run(job_id: str, source: DataSource) -> None:
    try:
        result = run_auto_dashboard(source)
        with _lock:
            _jobs[job_id] = DashboardJobStatus(job_id=job_id, status="done", result=result)
    except Exception as exc:
        with _lock:
            _jobs[job_id] = DashboardJobStatus(job_id=job_id, status="error", error=str(exc))


def get_job(job_id: str) -> DashboardJobStatus | None:
    with _lock:
        return _jobs.get(job_id)
