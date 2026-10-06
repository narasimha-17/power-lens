import uuid
from datetime import datetime, timezone

from app.db.app_db import get_connection, get_lock
from app.models import Alert


def _row_to_alert(row) -> Alert:
    return Alert(
        id=row["id"],
        dashboardId=row["dashboard_id"],
        chartId=row["chart_id"],
        message=row["message"],
        createdAt=row["created_at"],
        seen=bool(row["seen"]),
    )


def create_alert(dashboard_id: str, chart_id: str, message: str) -> Alert:
    conn = get_connection()
    with get_lock():
        alert_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO alerts (id, dashboard_id, chart_id, message, created_at, seen) VALUES (?, ?, ?, ?, ?, 0)",
            [alert_id, dashboard_id, chart_id, message, created_at],
        )
        conn.commit()
        return Alert(id=alert_id, dashboardId=dashboard_id, chartId=chart_id, message=message, createdAt=created_at)


def list_alerts(unseen_only: bool = False) -> list[Alert]:
    conn = get_connection()
    with get_lock():
        query = "SELECT * FROM alerts"
        if unseen_only:
            query += " WHERE seen = 0"
        query += " ORDER BY created_at DESC LIMIT 50"
        rows = conn.execute(query).fetchall()
        return [_row_to_alert(r) for r in rows]


def mark_seen(alert_id: str) -> None:
    conn = get_connection()
    with get_lock():
        conn.execute("UPDATE alerts SET seen = 1 WHERE id = ?", [alert_id])
        conn.commit()
