import uuid
from datetime import datetime, timezone

from app.db.app_db import get_connection, get_lock
from app.models import TableRelationship


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_relationship(row) -> TableRelationship:
    return TableRelationship(
        id=row["id"],
        sourceId=row["source_id"],
        tableA=row["table_a"],
        columnA=row["column_a"],
        tableB=row["table_b"],
        columnB=row["column_b"],
        createdAt=row["created_at"],
    )


def list_relationships(source_id: str) -> list[TableRelationship]:
    conn = get_connection()
    with get_lock():
        rows = conn.execute(
            "SELECT * FROM table_relationships WHERE source_id = ? ORDER BY created_at", [source_id]
        ).fetchall()
        return [_row_to_relationship(r) for r in rows]


def add_relationship(source_id: str, table_a: str, column_a: str, table_b: str, column_b: str) -> TableRelationship:
    conn = get_connection()
    relationship_id = uuid.uuid4().hex[:12]
    with get_lock():
        conn.execute(
            "INSERT INTO table_relationships (id, source_id, table_a, column_a, table_b, column_b, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            [relationship_id, source_id, table_a, column_a, table_b, column_b, _now()],
        )
        conn.commit()
        row = conn.execute("SELECT * FROM table_relationships WHERE id = ?", [relationship_id]).fetchone()
        assert row is not None
        return _row_to_relationship(row)


def delete_relationship(relationship_id: str) -> None:
    conn = get_connection()
    with get_lock():
        conn.execute("DELETE FROM table_relationships WHERE id = ?", [relationship_id])
        conn.commit()
