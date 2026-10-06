import pytest

from app.datasources import registry
from app.datasources.file_source import FileSource


@pytest.fixture(autouse=True)
def _isolate_registry_state(tmp_path, monkeypatch):
    monkeypatch.setattr(registry, "_MANIFEST_PATH", str(tmp_path / "sources_manifest.json"))
    registry._sources.clear()
    registry._connected_at.clear()
    yield
    registry._sources.clear()
    registry._connected_at.clear()


def _make_csv(tmp_path):
    csv_path = tmp_path / "sales.csv"
    csv_path.write_text("region,revenue\nUS,100\nEU,50\n")
    return str(csv_path)


def test_persist_and_reload_survives_registry_being_cleared(tmp_path):
    csv_path = _make_csv(tmp_path)
    source = FileSource(csv_path, "sales", source_id="file_persist_test")
    source.connect()
    registry.register(source)
    registry.persist_file_source("file_persist_test", csv_path, "sales")

    # Simulate a backend restart: the in-memory registry is wiped, but the manifest on
    # disk (and the underlying file) survive.
    registry._sources.clear()
    registry._connected_at.clear()
    with pytest.raises(registry.UnknownSourceError):
        registry.get("file_persist_test")

    registry.reload_persisted_sources()

    reconnected = registry.get("file_persist_test")
    assert reconnected.name() == "sales"


def test_reload_skips_entries_whose_file_no_longer_exists(tmp_path):
    csv_path = _make_csv(tmp_path)
    registry.persist_file_source("file_gone", csv_path, "sales")
    (tmp_path / "sales.csv").unlink()

    registry.reload_persisted_sources()

    with pytest.raises(registry.UnknownSourceError):
        registry.get("file_gone")


def test_remove_deletes_the_persisted_entry_too(tmp_path):
    csv_path = _make_csv(tmp_path)
    source = FileSource(csv_path, "sales", source_id="file_remove_test")
    source.connect()
    registry.register(source)
    registry.persist_file_source("file_remove_test", csv_path, "sales")

    registry.remove("file_remove_test")

    registry._sources.clear()
    registry._connected_at.clear()
    registry.reload_persisted_sources()
    with pytest.raises(registry.UnknownSourceError):
        registry.get("file_remove_test")
