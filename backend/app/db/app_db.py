import os
import sqlite3
import threading

from app.config import settings

_lock = threading.Lock()
_connection: sqlite3.Connection | None = None

_SCHEMA = """
CREATE TABLE IF NOT EXISTS dashboards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dashboard_charts (
    id TEXT PRIMARY KEY,
    dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_name TEXT NOT NULL,
    answer_json TEXT NOT NULL,
    color TEXT,
    pinned_at TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS custom_measures (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    name TEXT NOT NULL,
    expression TEXT NOT NULL,
    description TEXT,
    format TEXT NOT NULL DEFAULT 'number',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dashboard_chart_refresh (
    chart_id TEXT PRIMARY KEY REFERENCES dashboard_charts(id) ON DELETE CASCADE,
    dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL,
    question TEXT NOT NULL,
    interval_minutes INTEGER NOT NULL,
    alert_field TEXT,
    alert_operator TEXT,
    alert_threshold REAL,
    last_run_at TEXT,
    last_alert_at TEXT
);
CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    dashboard_id TEXT NOT NULL,
    chart_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    seen INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS shared_dashboards (
    token TEXT PRIMARY KEY,
    dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recent_sql_connections (
    id TEXT PRIMARY KEY,
    dialect TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    database TEXT NOT NULL,
    "user" TEXT NOT NULL,
    display_name TEXT NOT NULL,
    last_connected_at TEXT NOT NULL,
    UNIQUE(dialect, host, port, database, "user")
);
CREATE TABLE IF NOT EXISTS table_relationships (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    table_a TEXT NOT NULL,
    column_a TEXT NOT NULL,
    table_b TEXT NOT NULL,
    column_b TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""

# The bookmarks feature (saved cross-filter snapshots) was removed entirely — this drops the
# table from any existing database file rather than leaving it orphaned.
_DROP_TABLES = ["dashboard_bookmarks"]

# Columns added after the tables above already shipped — CREATE TABLE IF NOT EXISTS alone
# won't add them to a database file that already exists on disk from an earlier version, so
# each needs its own guarded ALTER TABLE.
_MIGRATIONS: list[tuple[str, str, str]] = [
    ("dashboard_charts", "size", "ALTER TABLE dashboard_charts ADD COLUMN size TEXT"),
    ("dashboards", "is_favorite", "ALTER TABLE dashboards ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0"),
    ("dashboard_charts", "live", "ALTER TABLE dashboard_charts ADD COLUMN live INTEGER NOT NULL DEFAULT 0"),
]


def _run_migrations(conn: sqlite3.Connection) -> None:
    for table, column, statement in _MIGRATIONS:
        existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in existing:
            conn.execute(statement)
    for table in _DROP_TABLES:
        conn.execute(f"DROP TABLE IF EXISTS {table}")


def get_connection() -> sqlite3.Connection:
    """The PowerLens application database — dashboards and their pinned charts, previously
    kept only in browser localStorage (lost on clearing browser data or switching browsers).
    A single lazily-created connection guarded by a lock, the same pattern as the DuckDB
    engine, since sqlite3 connections aren't safe to share across threads without one."""
    global _connection
    if _connection is None:
        if settings.app_db_path != ":memory:":
            os.makedirs(os.path.dirname(settings.app_db_path), exist_ok=True)
        _connection = sqlite3.connect(settings.app_db_path, check_same_thread=False)
        _connection.row_factory = sqlite3.Row
        _connection.execute("PRAGMA foreign_keys = ON")
        _connection.executescript(_SCHEMA)
        _run_migrations(_connection)
        _connection.commit()
    return _connection


def get_lock() -> threading.Lock:
    return _lock
