import re
import uuid

from app.datasources.duckdb_table_source import DuckdbTableSource
from app.db.duckdb_engine import get_connection, get_lock
from app.models import SourceType

_READERS = {"csv": "read_csv_auto", "parquet": "read_parquet", "json": "read_json_auto"}


def _safe_table_suffix(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_]", "_", name.lower())


def _guess_format(url: str) -> str:
    lower = url.lower().split("?")[0]
    if lower.endswith(".parquet"):
        return "parquet"
    if lower.endswith(".json"):
        return "json"
    return "csv"


class UrlSourceError(Exception):
    pass


class UrlFileSource(DuckdbTableSource):
    """A CSV/Parquet/JSON file read straight from an http(s):// or s3:// URL via DuckDB's
    httpfs extension — nothing is downloaded ahead of time, DuckDB streams it on query."""

    def __init__(
        self,
        url: str,
        display_name: str,
        fmt: str | None = None,
        source_id: str | None = None,
        s3_access_key: str | None = None,
        s3_secret_key: str | None = None,
        s3_region: str | None = None,
    ):
        self._id = source_id or f"file_{uuid.uuid4().hex[:8]}"
        self._url = url
        self._display_name = display_name
        self._format = fmt or _guess_format(url)
        if self._format not in _READERS:
            raise UrlSourceError(f"Unsupported format: {self._format} (expected csv, parquet, or json)")
        self._table_name = f"src_{self._id}_{_safe_table_suffix(display_name)}"[:63]
        self._secret_name = f"secret_{self._id}"
        self._s3_access_key = s3_access_key
        self._s3_secret_key = s3_secret_key
        self._s3_region = s3_region

    def id(self) -> str:
        return self._id

    def source_type(self) -> SourceType:
        return "file"

    def name(self) -> str:
        return self._display_name

    def _ensure_s3_secret(self, conn) -> None:
        if not self._s3_access_key:
            return
        parts = [f"KEY_ID '{self._s3_access_key}'", f"SECRET '{self._s3_secret_key or ''}'"]
        if self._s3_region:
            parts.append(f"REGION '{self._s3_region}'")
        conn.execute(f"CREATE OR REPLACE SECRET {self._secret_name} (TYPE S3, {', '.join(parts)})")

    def connect(self) -> None:
        conn = get_connection()
        with get_lock():
            try:
                conn.execute("INSTALL httpfs")
                conn.execute("LOAD httpfs")
                self._ensure_s3_secret(conn)
                reader = _READERS[self._format]
                conn.execute(f"CREATE OR REPLACE TABLE {self._table_name} AS SELECT * FROM {reader}(?)", [self._url])
            except Exception as exc:
                raise UrlSourceError(f"Could not load {self._url}: {exc}") from exc

    def refresh(self) -> None:
        self.connect()

    def close(self) -> None:
        conn = get_connection()
        with get_lock():
            conn.execute(f"DROP TABLE IF EXISTS {self._table_name}")
            if self._s3_access_key:
                conn.execute(f"DROP SECRET IF EXISTS {self._secret_name}")
