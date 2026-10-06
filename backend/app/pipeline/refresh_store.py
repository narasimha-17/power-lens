from datetime import datetime, timezone

from app.db.app_db import get_connection, get_lock
from app.models import ChartRefreshConfig


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_config(row) -> ChartRefreshConfig:
    return ChartRefreshConfig(
        chartId=row["chart_id"],
        dashboardId=row["dashboard_id"],
        sourceId=row["source_id"],
        question=row["question"],
        intervalMinutes=row["interval_minutes"],
        alertField=row["alert_field"],
        alertOperator=row["alert_operator"],
        alertThreshold=row["alert_threshold"],
        lastRunAt=row["last_run_at"],
        lastAlertAt=row["last_alert_at"],
    )


def get_refresh(chart_id: str) -> ChartRefreshConfig | None:
    conn = get_connection()
    with get_lock():
        row = conn.execute(
            "SELECT * FROM dashboard_chart_refresh WHERE chart_id = ?", [chart_id]
        ).fetchone()
        return _row_to_config(row) if row else None


def set_refresh(
    chart_id: str,
    dashboard_id: str,
    source_id: str,
    question: str,
    interval_minutes: int,
    alert_field: str | None,
    alert_operator: str | None,
    alert_threshold: float | None,
) -> ChartRefreshConfig:
    conn = get_connection()
    with get_lock():
        conn.execute(
            "INSERT INTO dashboard_chart_refresh "
            "(chart_id, dashboard_id, source_id, question, interval_minutes, alert_field, alert_operator, alert_threshold) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(chart_id) DO UPDATE SET interval_minutes = excluded.interval_minutes, "
            "alert_field = excluded.alert_field, alert_operator = excluded.alert_operator, "
            "alert_threshold = excluded.alert_threshold, question = excluded.question",
            [chart_id, dashboard_id, source_id, question, interval_minutes, alert_field, alert_operator, alert_threshold],
        )
        conn.commit()
        row = conn.execute("SELECT * FROM dashboard_chart_refresh WHERE chart_id = ?", [chart_id]).fetchone()
        assert row is not None
        return _row_to_config(row)


def delete_refresh(chart_id: str) -> None:
    conn = get_connection()
    with get_lock():
        conn.execute("DELETE FROM dashboard_chart_refresh WHERE chart_id = ?", [chart_id])
        conn.commit()


def due_for_refresh() -> list[ChartRefreshConfig]:
    """Charts whose auto-refresh interval has elapsed (or that have never run yet) — checked
    on a periodic tick by the background scheduler, the same pattern already used for
    re-loading a stale file/SQL source."""
    conn = get_connection()
    with get_lock():
        rows = conn.execute("SELECT * FROM dashboard_chart_refresh").fetchall()
    now = datetime.now(timezone.utc)
    due = []
    for row in rows:
        config = _row_to_config(row)
        if config.lastRunAt is None:
            due.append(config)
            continue
        elapsed_minutes = (now - datetime.fromisoformat(config.lastRunAt)).total_seconds() / 60
        if elapsed_minutes >= config.intervalMinutes:
            due.append(config)
    return due


def mark_run(chart_id: str) -> None:
    conn = get_connection()
    with get_lock():
        conn.execute(
            "UPDATE dashboard_chart_refresh SET last_run_at = ? WHERE chart_id = ?", [_now(), chart_id]
        )
        conn.commit()


def mark_alerted(chart_id: str) -> None:
    conn = get_connection()
    with get_lock():
        conn.execute(
            "UPDATE dashboard_chart_refresh SET last_alert_at = ? WHERE chart_id = ?", [_now(), chart_id]
        )
        conn.commit()
