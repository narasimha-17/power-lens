from datetime import datetime, timezone

from app.db.app_db import get_connection, get_lock
from app.models import CustomMeasure


class MeasureNotFoundError(Exception):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_measure(row) -> CustomMeasure:
    return CustomMeasure(
        id=row["id"],
        sourceId=row["source_id"],
        name=row["name"],
        expression=row["expression"],
        description=row["description"],
        format=row["format"],
        createdAt=row["created_at"],
    )


def list_measures(source_id: str) -> list[CustomMeasure]:
    conn = get_connection()
    with get_lock():
        rows = conn.execute(
            "SELECT * FROM custom_measures WHERE source_id = ? ORDER BY created_at", [source_id]
        ).fetchall()
        return [_row_to_measure(r) for r in rows]


def create_measure(
    measure_id: str, source_id: str, name: str, expression: str, description: str | None, format: str
) -> CustomMeasure:
    conn = get_connection()
    with get_lock():
        created_at = _now()
        conn.execute(
            "INSERT INTO custom_measures (id, source_id, name, expression, description, format, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            [measure_id, source_id, name.strip(), expression.strip(), description, format, created_at],
        )
        conn.commit()
        return CustomMeasure(
            id=measure_id, sourceId=source_id, name=name.strip(), expression=expression.strip(),
            description=description, format=format, createdAt=created_at,
        )


def delete_measure(measure_id: str) -> None:
    conn = get_connection()
    with get_lock():
        cur = conn.execute("DELETE FROM custom_measures WHERE id = ?", [measure_id])
        conn.commit()
        if cur.rowcount == 0:
            raise MeasureNotFoundError(measure_id)
