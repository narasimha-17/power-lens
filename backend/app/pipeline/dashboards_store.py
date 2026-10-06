from datetime import datetime, timezone

from app.db.app_db import get_connection, get_lock
from app.models import Dashboard, PinnedChart, QueryAnswer


class DashboardNotFoundError(Exception):
    pass


class ChartNotFoundError(Exception):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_chart(row) -> PinnedChart:
    return PinnedChart(
        id=row["id"],
        question=row["question"],
        sourceId=row["source_id"],
        sourceName=row["source_name"],
        answer=QueryAnswer.model_validate_json(row["answer_json"]),
        pinnedAt=row["pinned_at"],
        color=row["color"],
        size=row["size"],
        live=bool(row["live"]),
    )


def _fetch_dashboard(conn, dashboard_id: str) -> Dashboard | None:
    row = conn.execute("SELECT * FROM dashboards WHERE id = ?", [dashboard_id]).fetchone()
    if row is None:
        return None
    chart_rows = conn.execute(
        "SELECT * FROM dashboard_charts WHERE dashboard_id = ? ORDER BY position", [dashboard_id]
    ).fetchall()
    return Dashboard(
        id=row["id"],
        name=row["name"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        charts=[_row_to_chart(r) for r in chart_rows],
        isFavorite=bool(row["is_favorite"]),
    )


def _touch(conn, dashboard_id: str) -> None:
    conn.execute("UPDATE dashboards SET updated_at = ? WHERE id = ?", [_now(), dashboard_id])


def get_dashboard(dashboard_id: str) -> Dashboard | None:
    conn = get_connection()
    with get_lock():
        return _fetch_dashboard(conn, dashboard_id)


def list_dashboards() -> list[Dashboard]:
    conn = get_connection()
    with get_lock():
        ids = [
            r[0]
            for r in conn.execute(
                "SELECT id FROM dashboards ORDER BY is_favorite DESC, created_at DESC"
            ).fetchall()
        ]
        return [d for i in ids if (d := _fetch_dashboard(conn, i)) is not None]


def set_favorite(dashboard_id: str, is_favorite: bool) -> Dashboard:
    conn = get_connection()
    with get_lock():
        cur = conn.execute(
            "UPDATE dashboards SET is_favorite = ? WHERE id = ?", [1 if is_favorite else 0, dashboard_id]
        )
        conn.commit()
        if cur.rowcount == 0:
            raise DashboardNotFoundError(dashboard_id)
        dashboard = _fetch_dashboard(conn, dashboard_id)
        assert dashboard is not None
        return dashboard


def upsert_dashboard(dashboard_id: str, name: str, created_at: str, updated_at: str) -> Dashboard:
    """Create a dashboard under a client-supplied id (the frontend generates ids locally for
    instant, offline-tolerant UI updates) — or update its name/timestamps if it already
    exists, so retried/duplicate calls are harmless."""
    conn = get_connection()
    with get_lock():
        conn.execute(
            "INSERT INTO dashboards (id, name, created_at, updated_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at",
            [dashboard_id, name.strip() or "Untitled Dashboard", created_at, updated_at],
        )
        conn.commit()
        dashboard = _fetch_dashboard(conn, dashboard_id)
        assert dashboard is not None
        return dashboard


def delete_dashboard(dashboard_id: str) -> None:
    conn = get_connection()
    with get_lock():
        cur = conn.execute("DELETE FROM dashboards WHERE id = ?", [dashboard_id])
        conn.commit()
        if cur.rowcount == 0:
            raise DashboardNotFoundError(dashboard_id)


def add_chart(dashboard_id: str, chart: PinnedChart) -> Dashboard:
    conn = get_connection()
    with get_lock():
        exists = conn.execute("SELECT 1 FROM dashboards WHERE id = ?", [dashboard_id]).fetchone()
        if not exists:
            raise DashboardNotFoundError(dashboard_id)
        next_position = conn.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM dashboard_charts WHERE dashboard_id = ?",
            [dashboard_id],
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO dashboard_charts "
            "(id, dashboard_id, question, source_id, source_name, answer_json, color, pinned_at, position, size) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET question = excluded.question, answer_json = excluded.answer_json, "
            "color = excluded.color, size = excluded.size",
            [
                chart.id, dashboard_id, chart.question, chart.sourceId, chart.sourceName,
                chart.answer.model_dump_json(), chart.color, chart.pinnedAt, next_position, chart.size,
            ],
        )
        _touch(conn, dashboard_id)
        conn.commit()
        dashboard = _fetch_dashboard(conn, dashboard_id)
        assert dashboard is not None
        return dashboard


def remove_chart(dashboard_id: str, chart_id: str) -> Dashboard:
    conn = get_connection()
    with get_lock():
        exists = conn.execute("SELECT 1 FROM dashboards WHERE id = ?", [dashboard_id]).fetchone()
        if not exists:
            raise DashboardNotFoundError(dashboard_id)
        cur = conn.execute(
            "DELETE FROM dashboard_charts WHERE id = ? AND dashboard_id = ?", [chart_id, dashboard_id]
        )
        if cur.rowcount == 0:
            raise ChartNotFoundError(chart_id)
        _touch(conn, dashboard_id)
        conn.commit()
        dashboard = _fetch_dashboard(conn, dashboard_id)
        assert dashboard is not None
        return dashboard


def update_chart_answer(dashboard_id: str, chart_id: str, answer: QueryAnswer) -> Dashboard:
    conn = get_connection()
    with get_lock():
        cur = conn.execute(
            "UPDATE dashboard_charts SET answer_json = ? WHERE id = ? AND dashboard_id = ?",
            [answer.model_dump_json(), chart_id, dashboard_id],
        )
        if cur.rowcount == 0:
            raise ChartNotFoundError(chart_id)
        _touch(conn, dashboard_id)
        conn.commit()
        dashboard = _fetch_dashboard(conn, dashboard_id)
        assert dashboard is not None
        return dashboard


def update_chart_color(dashboard_id: str, chart_id: str, color: str) -> Dashboard:
    conn = get_connection()
    with get_lock():
        cur = conn.execute(
            "UPDATE dashboard_charts SET color = ? WHERE id = ? AND dashboard_id = ?",
            [color, chart_id, dashboard_id],
        )
        if cur.rowcount == 0:
            raise ChartNotFoundError(chart_id)
        _touch(conn, dashboard_id)
        conn.commit()
        dashboard = _fetch_dashboard(conn, dashboard_id)
        assert dashboard is not None
        return dashboard


def update_chart_size(dashboard_id: str, chart_id: str, size: str) -> Dashboard:
    conn = get_connection()
    with get_lock():
        cur = conn.execute(
            "UPDATE dashboard_charts SET size = ? WHERE id = ? AND dashboard_id = ?",
            [size, chart_id, dashboard_id],
        )
        if cur.rowcount == 0:
            raise ChartNotFoundError(chart_id)
        _touch(conn, dashboard_id)
        conn.commit()
        dashboard = _fetch_dashboard(conn, dashboard_id)
        assert dashboard is not None
        return dashboard


def update_chart_live(dashboard_id: str, chart_id: str, live: bool) -> Dashboard:
    conn = get_connection()
    with get_lock():
        cur = conn.execute(
            "UPDATE dashboard_charts SET live = ? WHERE id = ? AND dashboard_id = ?",
            [1 if live else 0, chart_id, dashboard_id],
        )
        if cur.rowcount == 0:
            raise ChartNotFoundError(chart_id)
        _touch(conn, dashboard_id)
        conn.commit()
        dashboard = _fetch_dashboard(conn, dashboard_id)
        assert dashboard is not None
        return dashboard
