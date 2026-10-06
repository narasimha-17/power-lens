import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

from app.datasources.base import DataSource
from app.datasources.type_utils import normalize_type
from app.db.duckdb_engine import get_connection, get_lock
from app.models import ColumnInfo, QueryResult, SchemaInfo, TableInfo

_executor = ThreadPoolExecutor(max_workers=4)


class DuckdbTableSource(DataSource):
    """Shared plumbing for any source that materializes into a single local DuckDB table —
    schema introspection, sampling, and query execution are identical regardless of where the
    table's data originally came from (an uploaded file, a remote URL, or a fetched API
    response). Subclasses only need to implement `connect()`/`refresh()` to populate
    `self._table_name`, plus `id()`, `source_type()` and `name()`."""

    _table_name: str

    def table_name(self) -> str:
        return self._table_name

    def get_schema(self) -> SchemaInfo:
        conn = get_connection()
        with get_lock():
            rows = conn.execute(
                "SELECT column_name, data_type FROM information_schema.columns "
                "WHERE table_name = ? ORDER BY ordinal_position",
                [self._table_name],
            ).fetchall()
            count = conn.execute(f"SELECT COUNT(*) FROM {self._table_name}").fetchone()[0]
        columns = [ColumnInfo(name=r[0], type=normalize_type(r[1]), raw_type=r[1]) for r in rows]
        return SchemaInfo(
            tables=[TableInfo(name=self._table_name, columns=columns, row_count_estimate=count)],
            dialect="duckdb",
        )

    def get_sample_rows(self, table: str, n: int = 5) -> list[dict]:
        conn = get_connection()
        with get_lock():
            cur = conn.execute(f"SELECT * FROM {table} LIMIT {int(n)}")
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]

    def execute_query(self, sql: str, timeout_s: float, max_rows: int) -> QueryResult:
        conn = get_connection()
        start = time.perf_counter()

        def _run():
            with get_lock():
                cur = conn.execute(sql)
                cols_desc = cur.description
                rows = cur.fetchmany(max_rows + 1)
                return cols_desc, rows

        future = _executor.submit(_run)
        try:
            cols_desc, rows = future.result(timeout=timeout_s)
        except FutureTimeoutError:
            with get_lock():
                conn.interrupt()
            raise TimeoutError(f"Query exceeded {timeout_s}s timeout")

        truncated = len(rows) > max_rows
        rows = rows[:max_rows]
        col_names = [d[0] for d in cols_desc]
        col_types = [normalize_type(str(d[1])) for d in cols_desc]
        columns = [ColumnInfo(name=n, type=t, raw_type=str(d[1])) for n, t, d in zip(col_names, col_types, cols_desc)]
        result_rows = [dict(zip(col_names, row)) for row in rows]
        return QueryResult(
            columns=columns,
            rows=result_rows,
            row_count=len(result_rows),
            truncated=truncated,
            execution_ms=(time.perf_counter() - start) * 1000,
        )

    def close(self) -> None:
        conn = get_connection()
        with get_lock():
            conn.execute(f"DROP TABLE IF EXISTS {self._table_name}")
