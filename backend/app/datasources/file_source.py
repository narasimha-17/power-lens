import re
import uuid

import pandas as pd

from app.datasources.duckdb_table_source import DuckdbTableSource
from app.db.duckdb_engine import get_connection, get_lock
from app.models import SourceType


def _safe_table_suffix(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_]", "_", name.lower())


class FileSource(DuckdbTableSource):
    def __init__(self, file_path: str, display_name: str, source_id: str | None = None):
        self._id = source_id or f"file_{uuid.uuid4().hex[:8]}"
        self._file_path = file_path
        self._display_name = display_name
        self._table_name = f"src_{self._id}_{_safe_table_suffix(display_name)}"[:63]

    def id(self) -> str:
        return self._id

    def source_type(self) -> SourceType:
        return "file"

    def name(self) -> str:
        return self._display_name

    def connect(self) -> None:
        conn = get_connection()
        lower = self._file_path.lower()
        with get_lock():
            if lower.endswith(".csv"):
                conn.execute(
                    f"CREATE OR REPLACE TABLE {self._table_name} AS "
                    f"SELECT * FROM read_csv_auto(?, sample_size=-1)",
                    [self._file_path],
                )
            elif lower.endswith((".xlsx", ".xls")):
                df = pd.read_excel(self._file_path)
                conn.register("_tmp_df", df)
                conn.execute(f"CREATE OR REPLACE TABLE {self._table_name} AS SELECT * FROM _tmp_df")
                conn.unregister("_tmp_df")
            else:
                raise ValueError(f"Unsupported file type: {self._file_path}")

    def refresh(self) -> None:
        """Re-read the file from disk into the same DuckDB table — useful when the file at
        this path gets overwritten in place (e.g. a scheduled export) rather than re-uploaded."""
        self.connect()
