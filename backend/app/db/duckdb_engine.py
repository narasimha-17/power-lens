import os
import threading

import duckdb

from app.config import settings

_lock = threading.Lock()
_connection: duckdb.DuckDBPyConnection | None = None


def get_connection() -> duckdb.DuckDBPyConnection:
    global _connection
    if _connection is None:
        if settings.duckdb_path != ":memory:":
            os.makedirs(os.path.dirname(settings.duckdb_path), exist_ok=True)
        _connection = duckdb.connect(settings.duckdb_path)
    return _connection


def get_lock() -> threading.Lock:
    return _lock
