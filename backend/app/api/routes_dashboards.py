from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models import (
    Alert,
    AlertOperator,
    ChartRefreshConfig,
    Dashboard,
    PinnedChart,
    QueryAnswer,
    SharedDashboardLink,
    TileSize,
)
from app.pipeline import alerts_store, dashboards_store as store, refresh_store, sharing_store

router = APIRouter()


class UpsertDashboardRequest(BaseModel):
    id: str
    name: str
    createdAt: str
    updatedAt: str


class AddChartRequest(BaseModel):
    id: str
    question: str
    sourceId: str
    sourceName: str
    answer: QueryAnswer
    pinnedAt: str
    color: str | None = None
    size: TileSize | None = None


class SetFavoriteRequest(BaseModel):
    isFavorite: bool


class UpdateChartColorRequest(BaseModel):
    color: str


class UpdateChartSizeRequest(BaseModel):
    size: TileSize


class UpdateChartLiveRequest(BaseModel):
    live: bool


class SetChartRefreshRequest(BaseModel):
    sourceId: str
    question: str
    intervalMinutes: int
    alertField: str | None = None
    alertOperator: AlertOperator | None = None
    alertThreshold: float | None = None


@router.get("/dashboards")
def list_dashboards() -> list[Dashboard]:
    return store.list_dashboards()


@router.put("/dashboards/{dashboard_id}")
def upsert_dashboard(dashboard_id: str, req: UpsertDashboardRequest) -> Dashboard:
    return store.upsert_dashboard(dashboard_id, req.name, req.createdAt, req.updatedAt)


@router.delete("/dashboards/{dashboard_id}")
def delete_dashboard(dashboard_id: str) -> dict:
    try:
        store.delete_dashboard(dashboard_id)
    except store.DashboardNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"deleted": True}


@router.put("/dashboards/{dashboard_id}/favorite")
def set_favorite(dashboard_id: str, req: SetFavoriteRequest) -> Dashboard:
    try:
        return store.set_favorite(dashboard_id, req.isFavorite)
    except store.DashboardNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/dashboards/{dashboard_id}/charts/{chart_id}")
def add_chart(dashboard_id: str, chart_id: str, req: AddChartRequest) -> Dashboard:
    chart = PinnedChart(
        id=chart_id, question=req.question, sourceId=req.sourceId, sourceName=req.sourceName,
        answer=req.answer, pinnedAt=req.pinnedAt, color=req.color, size=req.size,
    )
    try:
        return store.add_chart(dashboard_id, chart)
    except store.DashboardNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/dashboards/{dashboard_id}/charts/{chart_id}")
def remove_chart(dashboard_id: str, chart_id: str) -> Dashboard:
    try:
        return store.remove_chart(dashboard_id, chart_id)
    except (store.DashboardNotFoundError, store.ChartNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/dashboards/{dashboard_id}/charts/{chart_id}/answer")
def update_chart_answer(dashboard_id: str, chart_id: str, answer: QueryAnswer) -> Dashboard:
    try:
        return store.update_chart_answer(dashboard_id, chart_id, answer)
    except store.ChartNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/dashboards/{dashboard_id}/charts/{chart_id}/color")
def update_chart_color(dashboard_id: str, chart_id: str, req: UpdateChartColorRequest) -> Dashboard:
    try:
        return store.update_chart_color(dashboard_id, chart_id, req.color)
    except store.ChartNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/dashboards/{dashboard_id}/charts/{chart_id}/size")
def update_chart_size(dashboard_id: str, chart_id: str, req: UpdateChartSizeRequest) -> Dashboard:
    try:
        return store.update_chart_size(dashboard_id, chart_id, req.size)
    except store.ChartNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/dashboards/{dashboard_id}/charts/{chart_id}/live")
def update_chart_live(dashboard_id: str, chart_id: str, req: UpdateChartLiveRequest) -> Dashboard:
    try:
        return store.update_chart_live(dashboard_id, chart_id, req.live)
    except store.ChartNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/dashboards/{dashboard_id}/charts/{chart_id}/refresh")
def set_chart_refresh(dashboard_id: str, chart_id: str, req: SetChartRefreshRequest) -> ChartRefreshConfig:
    if req.intervalMinutes < 1:
        raise HTTPException(status_code=422, detail="intervalMinutes must be at least 1.")
    return refresh_store.set_refresh(
        chart_id, dashboard_id, req.sourceId, req.question, req.intervalMinutes,
        req.alertField, req.alertOperator, req.alertThreshold,
    )


@router.get("/dashboards/{dashboard_id}/charts/{chart_id}/refresh")
def get_chart_refresh(dashboard_id: str, chart_id: str) -> ChartRefreshConfig | None:
    return refresh_store.get_refresh(chart_id)


@router.delete("/dashboards/{dashboard_id}/charts/{chart_id}/refresh")
def delete_chart_refresh(dashboard_id: str, chart_id: str) -> dict:
    refresh_store.delete_refresh(chart_id)
    return {"deleted": True}


@router.get("/alerts")
def list_alerts(unseen_only: bool = False) -> list[Alert]:
    return alerts_store.list_alerts(unseen_only=unseen_only)


@router.put("/alerts/{alert_id}/seen")
def mark_alert_seen(alert_id: str) -> dict:
    alerts_store.mark_seen(alert_id)
    return {"seen": True}


@router.post("/dashboards/{dashboard_id}/share")
def create_share_link(dashboard_id: str) -> SharedDashboardLink:
    if store.get_dashboard(dashboard_id) is None:
        raise HTTPException(status_code=404, detail=dashboard_id)
    return sharing_store.get_or_create_share(dashboard_id)


@router.delete("/dashboards/{dashboard_id}/share")
def revoke_share_link(dashboard_id: str) -> dict:
    sharing_store.revoke_share(dashboard_id)
    return {"revoked": True}


@router.get("/shared/{token}")
def get_shared_dashboard(token: str) -> Dashboard:
    dashboard_id = sharing_store.resolve_share(token)
    if dashboard_id is None:
        raise HTTPException(status_code=404, detail="This share link is invalid or has been revoked.")
    dashboard = store.get_dashboard(dashboard_id)
    if dashboard is None:
        raise HTTPException(status_code=404, detail="This dashboard no longer exists.")
    return dashboard
