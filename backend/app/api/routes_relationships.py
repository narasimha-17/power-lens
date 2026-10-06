from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.datasources import registry
from app.models import TableRelationship
from app.pipeline import relationships_store as store

router = APIRouter()


class CreateRelationshipRequest(BaseModel):
    tableA: str
    columnA: str
    tableB: str
    columnB: str


@router.get("/sources/{source_id}/relationships")
def list_relationships(source_id: str) -> list[TableRelationship]:
    return store.list_relationships(source_id)


@router.post("/sources/{source_id}/relationships")
def create_relationship(source_id: str, req: CreateRelationshipRequest) -> TableRelationship:
    try:
        registry.get(source_id)
    except registry.UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if not req.tableA.strip() or not req.columnA.strip() or not req.tableB.strip() or not req.columnB.strip():
        raise HTTPException(status_code=422, detail="Both tables and columns are required.")

    return store.add_relationship(source_id, req.tableA, req.columnA, req.tableB, req.columnB)


@router.delete("/sources/{source_id}/relationships/{relationship_id}")
def delete_relationship(source_id: str, relationship_id: str) -> dict:
    store.delete_relationship(relationship_id)
    return {"deleted": True}
