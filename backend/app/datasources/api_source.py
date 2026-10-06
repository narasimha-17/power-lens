import re
import uuid

import httpx
import pandas as pd

from app.datasources.duckdb_table_source import DuckdbTableSource
from app.db.duckdb_engine import get_connection, get_lock
from app.models import SourceType

_COMMON_LIST_KEYS = ("data", "results", "items", "records")


def _safe_table_suffix(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_]", "_", name.lower())


class ApiSourceError(Exception):
    pass


class ApiSource(DuckdbTableSource):
    """A table backed by a JSON REST API response — fetched once on connect and re-fetched
    on refresh (manually, or on a schedule via the registry's auto-refresh loop), unlike
    UrlFileSource which lets DuckDB stream the remote file lazily per-query."""

    def __init__(
        self,
        url: str,
        display_name: str,
        headers: dict[str, str] | None = None,
        records_path: str | None = None,
        source_id: str | None = None,
    ):
        self._id = source_id or f"file_{uuid.uuid4().hex[:8]}"
        self._url = url
        self._display_name = display_name
        self._headers = headers or {}
        self._records_path = records_path
        self._table_name = f"src_{self._id}_{_safe_table_suffix(display_name)}"[:63]

    def id(self) -> str:
        return self._id

    def source_type(self) -> SourceType:
        return "file"

    def name(self) -> str:
        return self._display_name

    def _fetch_rows(self) -> list[dict]:
        try:
            resp = httpx.get(self._url, headers=self._headers, timeout=30.0)
            resp.raise_for_status()
            payload = resp.json()
        except Exception as exc:
            raise ApiSourceError(f"Could not fetch {self._url}: {exc}") from exc

        if isinstance(payload, list):
            rows = payload
        elif isinstance(payload, dict):
            key = self._records_path
            if key is None:
                key = next((k for k in _COMMON_LIST_KEYS if isinstance(payload.get(k), list)), None)
            if key is None or not isinstance(payload.get(key), list):
                raise ApiSourceError(
                    "The response is a JSON object, not a list — specify which key holds the array of "
                    f"records (tried: {', '.join(_COMMON_LIST_KEYS)})."
                )
            rows = payload[key]
        else:
            raise ApiSourceError("Response JSON must be an array of objects (or an object containing one).")

        if not rows:
            raise ApiSourceError("The API returned zero records.")
        if not all(isinstance(r, dict) for r in rows):
            raise ApiSourceError("Expected an array of JSON objects, one per row.")
        return rows

    def connect(self) -> None:
        rows = self._fetch_rows()
        df = pd.json_normalize(rows)
        conn = get_connection()
        with get_lock():
            conn.register("_tmp_api_df", df)
            conn.execute(f"CREATE OR REPLACE TABLE {self._table_name} AS SELECT * FROM _tmp_api_df")
            conn.unregister("_tmp_api_df")

    def refresh(self) -> None:
        self.connect()

    def close(self) -> None:
        conn = get_connection()
        with get_lock():
            conn.execute(f"DROP TABLE IF EXISTS {self._table_name}")
