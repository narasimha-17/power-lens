import json
import os
from datetime import datetime, timezone

from app.config import settings
from app.datasources.base import DataSource

_sources: dict[str, DataSource] = {}
_connected_at: dict[str, str] = {}
_refresh_interval_s: dict[str, int] = {}

_MANIFEST_PATH = os.path.join(os.path.dirname(settings.uploads_dir), "sources_manifest.json")


class UnknownSourceError(Exception):
    """Raised for an unrecognized source id — plain Exception rather than KeyError so
    str(exc) gives a clean message instead of KeyError's quoted-repr formatting."""


def register(source: DataSource) -> None:
    _sources[source.id()] = source
    _connected_at[source.id()] = datetime.now(timezone.utc).isoformat()


def get(source_id: str) -> DataSource:
    if source_id not in _sources:
        raise UnknownSourceError(f"Unknown data source: {source_id}")
    return _sources[source_id]


def get_connected_at(source_id: str) -> str | None:
    return _connected_at.get(source_id)


def touch_refreshed(source_id: str) -> None:
    _connected_at[source_id] = datetime.now(timezone.utc).isoformat()


def set_refresh_interval(source_id: str, seconds: int | None) -> None:
    if seconds is None:
        _refresh_interval_s.pop(source_id, None)
    else:
        _refresh_interval_s[source_id] = seconds


def get_refresh_interval(source_id: str) -> int | None:
    return _refresh_interval_s.get(source_id)


def due_for_refresh() -> list[DataSource]:
    """Sources whose auto-refresh interval has elapsed since they were last (re)loaded."""
    now = datetime.now(timezone.utc)
    due = []
    for source_id, interval_s in _refresh_interval_s.items():
        source = _sources.get(source_id)
        connected_at = _connected_at.get(source_id)
        if not source or not connected_at:
            continue
        elapsed = (now - datetime.fromisoformat(connected_at)).total_seconds()
        if elapsed >= interval_s:
            due.append(source)
    return due


def list_sources() -> list[DataSource]:
    return list(_sources.values())


def remove(source_id: str) -> None:
    if source_id not in _sources:
        raise UnknownSourceError(f"Unknown data source: {source_id}")
    source = _sources.pop(source_id)
    _connected_at.pop(source_id, None)
    _refresh_interval_s.pop(source_id, None)
    source.close()
    _remove_persisted_file_source(source_id)


def _load_manifest() -> dict:
    try:
        with open(_MANIFEST_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_manifest(manifest: dict) -> None:
    os.makedirs(os.path.dirname(_MANIFEST_PATH), exist_ok=True)
    with open(_MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)


def persist_file_source(source_id: str, file_path: str, display_name: str) -> None:
    """Remember an uploaded file source on disk so it survives a backend restart — the
    in-memory registry alone forgets every connected source the moment the process exits,
    which kept disconnecting the user's data mid-session every time a fix required a
    restart."""
    manifest = _load_manifest()
    manifest[source_id] = {"file_path": file_path, "display_name": display_name}
    _save_manifest(manifest)


def _remove_persisted_file_source(source_id: str) -> None:
    manifest = _load_manifest()
    if manifest.pop(source_id, None) is not None:
        _save_manifest(manifest)


def reload_persisted_sources() -> None:
    """Called once at startup: re-registers every previously uploaded file source whose
    underlying file is still on disk. Imported here (not at module load time) to avoid a
    circular import between registry and file_source."""
    from app.datasources.file_source import FileSource

    manifest = _load_manifest()
    changed = False
    for source_id, info in list(manifest.items()):
        file_path = info.get("file_path", "")
        if not os.path.exists(file_path):
            manifest.pop(source_id, None)
            changed = True
            continue
        try:
            source = FileSource(file_path, info.get("display_name", source_id), source_id=source_id)
            source.connect()
        except Exception:
            manifest.pop(source_id, None)
            changed = True
            continue
        register(source)
    if changed:
        _save_manifest(manifest)
