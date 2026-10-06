import pytest

from app.db import duckdb_engine


@pytest.fixture(autouse=True)
def isolated_duckdb_connection():
    """Tests must never touch the dev server's on-disk DuckDB file — it may be
    open in another process. Point the shared connection at a fresh in-memory
    database for the duration of each test."""
    original_connection = duckdb_engine._connection
    duckdb_engine._connection = None
    duckdb_engine.settings.duckdb_path = ":memory:"
    yield
    duckdb_engine._connection = original_connection
