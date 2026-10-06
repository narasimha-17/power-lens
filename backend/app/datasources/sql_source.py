import time
import uuid
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

from app.datasources.base import DataSource
from app.datasources.type_utils import normalize_type
from app.db.duckdb_engine import get_connection, get_lock
from app.models import ColumnInfo, QueryResult, SchemaInfo, SourceType, TableInfo

_executor = ThreadPoolExecutor(max_workers=4)

# Generous enough to cover a first-time `INSTALL <extension>` (which downloads DuckDB's
# connector from the internet the very first time it's used, then caches it locally) plus a
# real connection attempt, but still bounded — without this, an unreachable host or a
# firewall silently dropping packets could hang the request indefinitely instead of failing
# with a clear, actionable error.
CONNECT_TIMEOUT_S = 20

# DuckDB's own extension name for each dialect we expose to users.
_DUCKDB_EXTENSION = {"postgresql": "postgres", "mysql": "mysql", "sqlite": "sqlite"}

_SYSTEM_SCHEMAS = {"pg_catalog", "information_schema", "performance_schema", "mysql", "sys"}


def _escape_attach_literal(value: str) -> str:
    return value.replace("'", "''")


class SqlConnectionError(Exception):
    pass


class SqlSource(DataSource):
    """A live connection to an external Postgres/MySQL database, exposed to the rest of the
    app through DuckDB's ATTACH — every query reads the remote database directly (no copy),
    so unlike FileSource this never goes stale and needs no refresh step."""

    def __init__(
        self,
        dialect: str,
        host: str = "",
        port: int = 0,
        database: str = "",
        user: str = "",
        password: str = "",
        display_name: str = "",
        source_id: str | None = None,
        tables: list[str] | None = None,
        file_path: str | None = None,
    ):
        if dialect not in _DUCKDB_EXTENSION:
            raise SqlConnectionError(f"Unsupported SQL dialect: {dialect}")
        if dialect == "sqlite" and not file_path:
            raise SqlConnectionError("A file path is required to connect a SQLite database")
        self._dialect = dialect
        self._extension = _DUCKDB_EXTENSION[dialect]
        self._host = host
        self._port = port
        self._database = database
        self._user = user
        self._password = password
        self._file_path = file_path
        self._display_name = display_name
        self._id = source_id or f"sql_{uuid.uuid4().hex[:8]}"
        self._alias = f"src_{self._id}"
        # None means "expose every table DuckDB can see" — otherwise restrict to this list.
        self._tables = set(tables) if tables else None

    def connection_key(self) -> tuple[str, str, int, str, str] | None:
        """Identifies *what* this source is connected to (dialect/host/port/database/user),
        as opposed to `id()` which identifies *this particular registration* of it — used to
        detect "you're reconnecting the same database" and replace the stale entry instead
        of piling up a duplicate. None for a file-based SQLite connection, which has no
        equivalent notion of a shared remote endpoint to dedupe against."""
        if self._file_path is not None:
            return None
        return (self._dialect, self._host, self._port, self._database, self._user)

    def id(self) -> str:
        return self._id

    def source_type(self) -> SourceType:
        return "sql"

    def name(self) -> str:
        return self._display_name

    def alias(self) -> str:
        return self._alias

    def _attach_string(self) -> str:
        if self._extension == "postgres":
            parts = [
                f"host={self._host}",
                f"port={self._port}",
                f"dbname={self._database}",
                f"user={self._user}",
                f"password={self._password}",
                # libpq enforces this itself at the C level during the actual connect()
                # syscall — unlike a Python-side thread timeout, this reliably aborts a
                # connection to an unreachable/black-holed host instead of blocking
                # indefinitely (a plain thread-pool timeout can't preempt a native extension
                # call that never yields the GIL back to the calling thread).
                f"connect_timeout={CONNECT_TIMEOUT_S}",
            ]
        else:
            parts = [
                f"host={self._host}",
                f"port={self._port}",
                f"database={self._database}",
                f"user={self._user}",
                f"password={self._password}",
            ]
        return _escape_attach_literal(" ".join(parts))

    def connect(self) -> None:
        conn = get_connection()
        target = _escape_attach_literal(self._file_path) if self._dialect == "sqlite" else self._attach_string()
        where = self._file_path if self._dialect == "sqlite" else f"{self._host}:{self._port}/{self._database}"

        def _do_connect() -> None:
            with get_lock():
                conn.execute(f"INSTALL {self._extension}")
                conn.execute(f"LOAD {self._extension}")
                conn.execute(f"ATTACH '{target}' AS {self._alias} (TYPE {self._extension}, READ_ONLY)")

        future = _executor.submit(_do_connect)
        try:
            future.result(timeout=CONNECT_TIMEOUT_S)
        except FutureTimeoutError as exc:
            raise SqlConnectionError(
                f"Timed out after {CONNECT_TIMEOUT_S}s connecting to {self._dialect} database at {where} — "
                "the host may be unreachable, or this could be a slow first-time download of "
                "DuckDB's connector extension. Check the host/port and your network connection, then retry."
            ) from exc
        except Exception as exc:
            raise SqlConnectionError(f"Could not connect to {self._dialect} database at {where}: {exc}") from exc

    def get_schema(self) -> SchemaInfo:
        conn = get_connection()
        with get_lock():
            rows = conn.execute(
                "SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns "
                "WHERE table_catalog = ? ORDER BY table_schema, table_name, ordinal_position",
                [self._alias],
            ).fetchall()

        tables: dict[str, list[ColumnInfo]] = {}
        for schema_name, table_name, col_name, data_type in rows:
            if schema_name in _SYSTEM_SCHEMAS:
                continue
            if self._tables is not None and table_name not in self._tables:
                continue
            qualified = f"{self._alias}.{schema_name}.{table_name}"
            tables.setdefault(qualified, []).append(
                ColumnInfo(name=col_name, type=normalize_type(data_type), raw_type=data_type)
            )

        table_infos = []
        for qualified, columns in tables.items():
            count = None
            try:
                with get_lock():
                    count = conn.execute(f"SELECT COUNT(*) FROM {qualified}").fetchone()[0]
            except Exception:
                pass
            table_infos.append(TableInfo(name=qualified, columns=columns, row_count_estimate=count))

        # Every generated SQL statement runs through this shared DuckDB connection (the
        # attached catalog is just another set of tables to it), so the dialect the LLM/
        # validator must target is always "duckdb" — never the remote database's own dialect.
        return SchemaInfo(tables=table_infos, dialect="duckdb")

    def get_sample_rows(self, table: str, n: int = 5) -> list[dict]:
        if not table.startswith(f"{self._alias}."):
            raise ValueError(f"Table {table!r} does not belong to this source")
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

    def is_read_only(self) -> bool:
        return True

    def is_alive(self) -> bool:
        """Runs a cheap query against the remote database's own catalog to confirm the
        attachment still actually works — DuckDB keeps a `SqlSource` registered forever once
        attached, even after the remote Postgres/MySQL server goes down or drops the
        connection, so listing sources needs an active check rather than trusting the
        registry.

        This shares the one DuckDB connection/lock with every real query (including a live
        chart's poll and any in-flight LLM-generated query) — a busy connection is completely
        normal, not a sign of a dead source, so a timeout waiting for the lock is treated as
        "inconclusive, assume alive" rather than "dead". Only an actual error surfacing from
        the query itself (the attachment is gone, the remote server refused/dropped the
        connection) counts as proof the source is really disconnected — an earlier version of
        this check treated a timeout the same as an error and ended up silently detaching
        sources that were simply busy, not broken."""
        conn = get_connection()

        def _check() -> None:
            with get_lock():
                conn.execute(f"SELECT 1 FROM {self._alias}.information_schema.tables LIMIT 1")

        future = _executor.submit(_check)
        try:
            future.result(timeout=15)
        except FutureTimeoutError:
            return True
        except Exception:
            return False
        return True

    def close(self) -> None:
        conn = get_connection()
        with get_lock():
            try:
                conn.execute(f"DETACH {self._alias}")
            except Exception:
                pass
