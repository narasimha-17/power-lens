import os
import uuid

from fastapi import APIRouter, HTTPException, UploadFile

from app.config import settings
from app.datasources import registry
from app.datasources.api_source import ApiSource, ApiSourceError
from app.datasources.file_source import FileSource
from app.datasources.sql_source import SqlConnectionError, SqlSource
from app.datasources.url_source import UrlFileSource, UrlSourceError
from app.models import (
    ApiConnectionRequest,
    RecentSqlConnection,
    RefreshScheduleRequest,
    SchemaInfo,
    SourceInfo,
    SqlConnectionRequest,
    UrlConnectionRequest,
)
from app.pipeline import recent_connections_store

router = APIRouter()


@router.post("/datasources/upload")
async def upload_datasource(file: UploadFile) -> dict:
    if not file.filename or not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .csv, .xlsx, .xls files are supported")

    os.makedirs(settings.uploads_dir, exist_ok=True)
    source_id = f"file_{uuid.uuid4().hex[:8]}"
    ext = os.path.splitext(file.filename)[1]
    saved_path = os.path.join(settings.uploads_dir, f"{source_id}{ext}")
    with open(saved_path, "wb") as f:
        f.write(await file.read())

    display_name = os.path.splitext(file.filename)[0]
    source = FileSource(saved_path, display_name, source_id=source_id)
    try:
        source.connect()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to load file: {exc}") from exc

    registry.register(source)
    registry.persist_file_source(source_id, saved_path, display_name)
    return {"source_id": source.id(), "schema": source.get_schema().model_dump()}


@router.post("/datasources/sql")
def connect_sql_datasource(req: SqlConnectionRequest) -> dict:
    source = SqlSource(
        dialect=req.dialect,
        host=req.host,
        port=req.port,
        database=req.database,
        user=req.user,
        password=req.password,
        display_name=req.display_name,
        tables=req.tables,
    )
    try:
        source.connect()
        schema = source.get_schema()
    except SqlConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not schema.tables:
        source.close()
        raise HTTPException(status_code=400, detail="Connected, but no tables were found to query.")

    # Reconnecting the same database (e.g. via a "Recent Connections" pick, or just
    # submitting the form again) previously registered a second, independent source
    # alongside the first instead of replacing it — same live data under two different
    # source ids, shown as a confusing duplicate in the sources list. Treat connecting as
    # idempotent per (dialect, host, port, database, user) instead.
    new_key = source.connection_key()
    if new_key is not None:
        for existing in registry.list_sources():
            if isinstance(existing, SqlSource) and existing.connection_key() == new_key:
                registry.remove(existing.id())

    registry.register(source)
    # Credentials are kept in memory only (not persisted to the sources manifest) — the
    # connection needs to be re-entered after a backend restart, on purpose. Everything
    # except the password is remembered separately so reconnecting is a couple of clicks
    # plus the password, not retyping the whole form.
    recent_connections_store.record_recent(
        req.dialect, req.host, req.port, req.database, req.user, req.display_name
    )
    return {"source_id": source.id(), "schema": schema.model_dump()}


@router.get("/datasources/sql/recent")
def list_recent_sql_connections() -> list[RecentSqlConnection]:
    return recent_connections_store.list_recent()


@router.delete("/datasources/sql/recent/{connection_id}")
def delete_recent_sql_connection(connection_id: str) -> dict:
    recent_connections_store.delete_recent(connection_id)
    return {"deleted": True}


@router.post("/datasources/sqlite/upload")
async def upload_sqlite_datasource(file: UploadFile) -> dict:
    if not file.filename or not file.filename.lower().endswith((".sqlite", ".db", ".sqlite3")):
        raise HTTPException(status_code=400, detail="Only .sqlite, .db, .sqlite3 files are supported")

    os.makedirs(settings.uploads_dir, exist_ok=True)
    source_id = f"sql_{uuid.uuid4().hex[:8]}"
    ext = os.path.splitext(file.filename)[1]
    saved_path = os.path.join(settings.uploads_dir, f"{source_id}{ext}")
    with open(saved_path, "wb") as f:
        f.write(await file.read())

    display_name = os.path.splitext(file.filename)[0]
    source = SqlSource(dialect="sqlite", file_path=saved_path, display_name=display_name, source_id=source_id)
    try:
        source.connect()
        schema = source.get_schema()
    except SqlConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    registry.register(source)
    return {"source_id": source.id(), "schema": schema.model_dump()}


@router.post("/datasources/url")
def connect_url_datasource(req: UrlConnectionRequest) -> dict:
    try:
        source = UrlFileSource(
            url=req.url,
            display_name=req.display_name,
            fmt=req.format,
            s3_access_key=req.s3_access_key,
            s3_secret_key=req.s3_secret_key,
            s3_region=req.s3_region,
        )
        source.connect()
        schema = source.get_schema()
    except UrlSourceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    registry.register(source)
    return {"source_id": source.id(), "schema": schema.model_dump()}


@router.post("/datasources/api")
def connect_api_datasource(req: ApiConnectionRequest) -> dict:
    source = ApiSource(
        url=req.url,
        display_name=req.display_name,
        headers=req.headers,
        records_path=req.records_path,
    )
    try:
        source.connect()
        schema = source.get_schema()
    except ApiSourceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    registry.register(source)
    return {"source_id": source.id(), "schema": schema.model_dump()}


@router.get("/datasources")
def list_datasources() -> list[SourceInfo]:
    result = []
    for s in registry.list_sources():
        if not s.is_alive():
            registry.remove(s.id())
            continue
        result.append(
            SourceInfo(
                id=s.id(),
                source_type=s.source_type(),
                name=s.name(),
                last_refreshed=registry.get_connected_at(s.id()),
                refresh_interval_s=registry.get_refresh_interval(s.id()),
            )
        )
    return result


@router.post("/datasources/{source_id}/refresh")
def refresh_datasource(source_id: str) -> dict:
    try:
        source = registry.get(source_id)
    except registry.UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    try:
        source.refresh()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Refresh failed: {exc}") from exc
    registry.touch_refreshed(source_id)
    return {"last_refreshed": registry.get_connected_at(source_id)}


@router.put("/datasources/{source_id}/schedule")
def set_datasource_schedule(source_id: str, req: RefreshScheduleRequest) -> dict:
    try:
        registry.get(source_id)
    except registry.UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if req.interval_s is not None and req.interval_s < 60:
        raise HTTPException(status_code=400, detail="Refresh interval must be at least 60 seconds.")
    registry.set_refresh_interval(source_id, req.interval_s)
    return {"refresh_interval_s": registry.get_refresh_interval(source_id)}


@router.get("/datasources/{source_id}/schema")
def get_datasource_schema(source_id: str) -> SchemaInfo:
    try:
        source = registry.get(source_id)
    except registry.UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return source.get_schema()


@router.delete("/datasources/{source_id}")
def delete_datasource(source_id: str) -> dict:
    try:
        registry.remove(source_id)
    except registry.UnknownSourceError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "deleted"}
