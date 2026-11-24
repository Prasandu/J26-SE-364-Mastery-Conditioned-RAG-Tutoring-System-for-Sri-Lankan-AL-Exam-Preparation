"""Storage dependency failures remain typed and never switch the configured data store."""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.admin.store import PostgresAdminStore, StorageUnavailable
from app.main import create_app
from tests.test_admin_access import admin_settings


def test_missing_pool_driver_is_a_storage_error_not_an_unhandled_import_error(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setitem(sys.modules, "psycopg_pool", None)
    store = PostgresAdminStore("postgresql://example.invalid/test", tmp_path)
    with pytest.raises(StorageUnavailable, match="driver is not installed"):
        store.list("drafts")


def test_missing_driver_has_a_typed_admin_error_with_cors(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setitem(sys.modules, "psycopg_pool", None)
    store = PostgresAdminStore("postgresql://example.invalid/test", tmp_path)
    monkeypatch.setattr("app.admin.common.open_admin_store", lambda settings: store)
    with TestClient(
        create_app(admin_settings(tmp_path)),
        base_url="http://127.0.0.1:9100",
        client=("127.0.0.1", 51000),
    ) as client:
        result = client.get("/admin/dev/status", headers={"Origin": "http://localhost:5173"})
    assert result.status_code == 500
    assert result.json()["error"]["code"] == "admin_storage_error"
    assert result.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "psycopg_pool" not in result.text
