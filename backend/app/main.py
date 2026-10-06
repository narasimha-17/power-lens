import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    routes_agent,
    routes_bi_agent,
    routes_dashboards,
    routes_datasources,
    routes_forecast,
    routes_health,
    routes_measures,
    routes_overview,
    routes_query,
    routes_relationships,
)
from app.config import settings
from app.datasources import registry

logger = logging.getLogger(__name__)

app = FastAPI(title="PowerLens API")

_REFRESH_CHECK_INTERVAL_S = 30
_CHART_REFRESH_CHECK_INTERVAL_S = 60

_ALERT_OPERATORS = {
    "gt": lambda value, threshold: value > threshold,
    "lt": lambda value, threshold: value < threshold,
    "gte": lambda value, threshold: value >= threshold,
    "lte": lambda value, threshold: value <= threshold,
    "eq": lambda value, threshold: value == threshold,
}


async def _auto_refresh_loop() -> None:
    """Background tick that re-loads any source whose auto-refresh interval has elapsed —
    the scheduled-refresh counterpart to manually re-uploading a file."""
    while True:
        await asyncio.sleep(_REFRESH_CHECK_INTERVAL_S)
        for source in registry.due_for_refresh():
            try:
                await asyncio.to_thread(source.refresh)
                registry.touch_refreshed(source.id())
            except Exception:
                logger.exception("Scheduled refresh failed for source %s", source.id())


def _run_one_chart_refresh(config) -> None:
    from app.pipeline import alerts_store, dashboards_store, refresh_store
    from app.pipeline.query_executor import PipelineError, answer_question

    try:
        source = registry.get(config.sourceId)
    except registry.UnknownSourceError:
        return

    try:
        answer = answer_question(source, config.question)
        dashboards_store.update_chart_answer(config.dashboardId, config.chartId, answer)
    except PipelineError:
        logger.exception("Scheduled chart refresh failed for chart %s", config.chartId)
        return
    finally:
        refresh_store.mark_run(config.chartId)

    if not (config.alertField and config.alertOperator and config.alertThreshold is not None):
        return
    if not answer.result.rows or config.alertField not in answer.result.rows[0]:
        return
    try:
        value = float(answer.result.rows[0][config.alertField])
    except (TypeError, ValueError):
        return
    check = _ALERT_OPERATORS[config.alertOperator]
    if check(value, config.alertThreshold):
        alerts_store.create_alert(
            config.dashboardId, config.chartId,
            f"\"{config.question}\" — {config.alertField} is {value:g}, "
            f"crossing the {config.alertOperator} {config.alertThreshold:g} threshold.",
        )
        refresh_store.mark_alerted(config.chartId)


async def _chart_refresh_loop() -> None:
    """Background tick that re-runs any pinned chart with auto-refresh enabled and raises an
    alert if its configured threshold is crossed — the dashboard-level counterpart to
    `_auto_refresh_loop`, which only re-loads a source's raw data."""
    from app.pipeline import refresh_store

    while True:
        await asyncio.sleep(_CHART_REFRESH_CHECK_INTERVAL_S)
        for config in refresh_store.due_for_refresh():
            try:
                await asyncio.to_thread(_run_one_chart_refresh, config)
            except Exception:
                logger.exception("Scheduled chart refresh crashed for chart %s", config.chartId)


@app.on_event("startup")
def _reconnect_persisted_sources() -> None:
    registry.reload_persisted_sources()


@app.on_event("startup")
async def _start_auto_refresh_loop() -> None:
    asyncio.create_task(_auto_refresh_loop())
    asyncio.create_task(_chart_refresh_loop())

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_health.router)
app.include_router(routes_datasources.router)
app.include_router(routes_query.router)
app.include_router(routes_overview.router)
app.include_router(routes_agent.router)
app.include_router(routes_forecast.router)
app.include_router(routes_bi_agent.router)
app.include_router(routes_dashboards.router)
app.include_router(routes_measures.router)
app.include_router(routes_relationships.router)
