import uuid
from datetime import datetime, timezone

from app.db.app_db import get_connection, get_lock
from app.models import RecentSqlConnection


def _row_to_connection(row) -> RecentSqlConnection:
    return RecentSqlConnection(
        id=row["id"],
        dialect=row["dialect"],
        host=row["host"],
        port=row["port"],
        database=row["database"],
        user=row["user"],
        display_name=row["display_name"],
        last_connected_at=row["last_connected_at"],
    )


def list_recent() -> list[RecentSqlConnection]:
    conn = get_connection()
    with get_lock():
        rows = conn.execute(
            "SELECT * FROM recent_sql_connections ORDER BY last_connected_at DESC LIMIT 10"
        ).fetchall()
        return [_row_to_connection(r) for r in rows]


def record_recent(
    dialect: str, host: str, port: int, database: str, user: str, display_name: str
) -> None:
    """Upserts by (dialect, host, port, database, user) — reconnecting to the same database
    just bumps its recency and refreshes the display name, rather than piling up duplicates
    every time the same source is reconnected after a restart."""
    conn = get_connection()
    with get_lock():
        conn.execute(
            "INSERT INTO recent_sql_connections "
            '(id, dialect, host, port, database, "user", display_name, last_connected_at) '
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(dialect, host, port, database, \"user\") DO UPDATE SET "
            "display_name = excluded.display_name, last_connected_at = excluded.last_connected_at",
            [
                str(uuid.uuid4()), dialect, host, port, database, user, display_name,
                datetime.now(timezone.utc).isoformat(),
            ],
        )
        conn.commit()


def delete_recent(connection_id: str) -> None:
    conn = get_connection()
    with get_lock():
        conn.execute("DELETE FROM recent_sql_connections WHERE id = ?", [connection_id])
        conn.commit()
