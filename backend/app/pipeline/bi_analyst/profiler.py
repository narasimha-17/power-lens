from app.datasources.base import DataSource
from app.db.duckdb_engine import get_connection, get_lock
from app.models import ColumnInfo
from app.pipeline.bi_analyst.models import ColumnProfile, DatasetProfile


def _quote(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def profile_dataset(source: DataSource) -> DatasetProfile:
    """Profile the primary table of a connected data source — per-column null rate,
    cardinality, distribution stats, plus a dataset-level duplicate-row rate. This is the
    raw material every later stage (semantic mapping, domain detection, signal detection,
    question generation) reasons over, so it runs once and gets reused throughout."""
    schema = source.get_schema()
    table = schema.tables[0]
    conn = get_connection()
    with get_lock():
        row_count = conn.execute(f"SELECT COUNT(*) FROM {table.name}").fetchone()[0]
        columns = [_profile_column(conn, table.name, col, row_count) for col in table.columns]
        duplicate_pct = _duplicate_row_pct(conn, table.name, table.columns, row_count)
    return DatasetProfile(
        table=table.name,
        row_count=row_count,
        column_count=len(table.columns),
        duplicate_row_pct=duplicate_pct,
        columns=columns,
    )


def _profile_column(conn, table_name: str, col: ColumnInfo, row_count: int) -> ColumnProfile:
    qcol = _quote(col.name)
    null_count, distinct_count = conn.execute(
        f"SELECT COUNT(*) FILTER (WHERE {qcol} IS NULL), COUNT(DISTINCT {qcol}) FROM {table_name}"
    ).fetchone()
    null_pct = (null_count / row_count * 100) if row_count else 0.0
    cardinality_ratio = (distinct_count / row_count) if row_count else 0.0

    min_value: float | None = None
    max_value: float | None = None
    mean_value: float | None = None
    date_min: str | None = None
    date_max: str | None = None
    sample_values: list[str] = []

    if col.type == "numeric":
        raw_min, raw_max, raw_mean = conn.execute(
            f"SELECT MIN({qcol}), MAX({qcol}), AVG({qcol}) FROM {table_name}"
        ).fetchone()
        min_value = float(raw_min) if raw_min is not None else None
        max_value = float(raw_max) if raw_max is not None else None
        mean_value = round(float(raw_mean), 4) if raw_mean is not None else None
    elif col.type == "datetime":
        raw_min, raw_max = conn.execute(f"SELECT MIN({qcol}), MAX({qcol}) FROM {table_name}").fetchone()
        date_min = str(raw_min) if raw_min is not None else None
        date_max = str(raw_max) if raw_max is not None else None
    else:
        rows = conn.execute(
            f"SELECT {qcol} FROM {table_name} WHERE {qcol} IS NOT NULL "
            f"GROUP BY {qcol} ORDER BY COUNT(*) DESC LIMIT 8"
        ).fetchall()
        sample_values = [str(r[0]) for r in rows]

    is_potential_key = row_count > 0 and null_count == 0 and distinct_count == row_count

    return ColumnProfile(
        name=col.name,
        type=col.type,
        null_pct=round(null_pct, 2),
        distinct_count=distinct_count,
        cardinality_ratio=round(cardinality_ratio, 4),
        min_value=min_value,
        max_value=max_value,
        mean_value=mean_value,
        date_min=date_min,
        date_max=date_max,
        sample_values=sample_values,
        is_potential_key=is_potential_key,
    )


def _duplicate_row_pct(conn, table_name: str, columns: list[ColumnInfo], row_count: int) -> float:
    if row_count == 0 or not columns:
        return 0.0
    try:
        distinct_rows = conn.execute(
            f"SELECT COUNT(*) FROM (SELECT DISTINCT * FROM {table_name})"
        ).fetchone()[0]
        return round((1 - distinct_rows / row_count) * 100, 2)
    except Exception:
        # `SELECT DISTINCT *` can fail on exotic column types (e.g. nested structs) —
        # duplicate-row detection is a nice-to-have warning, not worth failing the whole
        # analysis over.
        return 0.0
