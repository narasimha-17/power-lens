import secrets
from datetime import datetime, timezone

from app.db.app_db import get_connection, get_lock
from app.models import SharedDashboardLink


def _row_to_link(row) -> SharedDashboardLink:
    return SharedDashboardLink(token=row["token"], dashboardId=row["dashboard_id"], createdAt=row["created_at"])


def get_or_create_share(dashboard_id: str) -> SharedDashboardLink:
    """Reuses an existing share link for this dashboard if one was already generated,
    instead of minting a new (and now-broken) URL every time the user re-opens the share
    dialog."""
    conn = get_connection()
    with get_lock():
        row = conn.execute(
            "SELECT * FROM shared_dashboards WHERE dashboard_id = ? ORDER BY created_at LIMIT 1", [dashboard_id]
        ).fetchone()
        if row:
            return _row_to_link(row)
        token = secrets.token_urlsafe(16)
        created_at = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO shared_dashboards (token, dashboard_id, created_at) VALUES (?, ?, ?)",
            [token, dashboard_id, created_at],
        )
        conn.commit()
        return SharedDashboardLink(token=token, dashboardId=dashboard_id, createdAt=created_at)


def resolve_share(token: str) -> str | None:
    """Returns the dashboard id for a share token, or None if the link doesn't exist / was revoked."""
    conn = get_connection()
    with get_lock():
        row = conn.execute("SELECT dashboard_id FROM shared_dashboards WHERE token = ?", [token]).fetchone()
        return row["dashboard_id"] if row else None


def revoke_share(dashboard_id: str) -> None:
    conn = get_connection()
    with get_lock():
        conn.execute("DELETE FROM shared_dashboards WHERE dashboard_id = ?", [dashboard_id])
        conn.commit()
