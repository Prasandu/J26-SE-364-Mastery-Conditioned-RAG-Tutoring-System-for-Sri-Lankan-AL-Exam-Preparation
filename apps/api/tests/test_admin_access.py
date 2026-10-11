"""Development-admin access guard, settings and private storage (C1). Offline only."""

import json
from pathlib import Path
from typing import Any

import pytest
from starlette.requests import Request

from app.admin.access import require_dev_admin
from app.admin.store import AdminStore, IntegrityError, StoreError, VersionConflict
from app.errors import ApiError
from app.settings import REPO_ROOT, ConfigurationError, Settings


def admin_settings(tmp_path: Path, **over: Any) -> Settings:
    base: dict[str, Any] = {
        "_env_file": None,
        "environment": "development",
        "principal_provider": "development",
        "admin_mode": "development",
        "admin_data_dir": tmp_path / "admin",
        "llm_provider": "disabled",
        "OPENAI_API_KEY": None,
        "GROQ_API_KEY": None,
    }
    return Settings(**{**base, **over})


def request(
    client: str | None = "127.0.0.1", host: str = "127.0.0.1:8000", **headers: str
) -> Request:
    raw = [(b"host", host.encode())] + [
        (k.replace("_", "-").lower().encode(), v.encode()) for k, v in headers.items()
    ]
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/admin/dev/status",
        "headers": raw,
        "client": (client, 50000) if client else None,
        "query_string": b"",
    }
    return Request(scope)


# ---------------------------------------------------------------- settings


def test_admin_mode_is_disabled_by_default() -> None:
    assert Settings(_env_file=None).admin_mode == "disabled"


@pytest.mark.parametrize("environment", ["test", "production"])
def test_admin_mode_refused_outside_development(tmp_path: Path, environment: str) -> None:
    settings = admin_settings(tmp_path, environment=environment, principal_provider="test")
    with pytest.raises(ConfigurationError, match="development environment"):
        settings.validate_for_startup()


def test_admin_data_dir_may_not_point_into_content(tmp_path: Path) -> None:
    settings = admin_settings(tmp_path, admin_data_dir=REPO_ROOT / "content" / "drafts")
    with pytest.raises(ConfigurationError, match="content"):
        settings.validate_for_startup()
    admin_settings(tmp_path).validate_for_startup()


# ---------------------------------------------------------------- access guard


def test_verified_loopback_request_is_allowed(tmp_path: Path) -> None:
    settings = admin_settings(tmp_path)
    require_dev_admin(request(), settings)
    require_dev_admin(request(client="::1", host="[::1]:8000"), settings)
    require_dev_admin(request(host="localhost:8000", origin="http://localhost:5173"), settings)


@pytest.mark.parametrize(
    "req",
    [
        request(client="192.168.1.20"),  # remote peer
        request(client="10.0.0.5", x_forwarded_for="127.0.0.1"),  # spoofed forwarding header
        request(client=None),  # no peer information
        request(client="testclient"),  # not an IP address
        request(x_forwarded_for="203.0.113.9"),  # local proxy forwarding remote traffic
        request(forwarded="for=203.0.113.9"),
        request(x_real_ip="203.0.113.9"),
        request(host="evil.example:8000"),  # DNS rebinding
        request(host="127.0.0.1.nip.io"),
        request(origin="https://evil.example"),  # cross-site page
        request(origin="http://localhost:9999"),  # loopback but not an allowed origin
        request(x_admin="true", authorization="Bearer admin"),  # header claims grant nothing
    ],
)
def test_untrusted_requests_get_404(tmp_path: Path, req: Request) -> None:
    settings = admin_settings(tmp_path)
    if "x-admin" in req.headers:
        # The claim headers alone (from a remote peer) must not authorize anything.
        req.scope["client"] = ("198.51.100.4", 1)
    with pytest.raises(ApiError) as caught:
        require_dev_admin(req, settings)
    assert caught.value.status == 404


def test_disabled_mode_is_404_even_from_loopback(tmp_path: Path) -> None:
    with pytest.raises(ApiError) as caught:
        require_dev_admin(request(), admin_settings(tmp_path, admin_mode="disabled"))
    assert caught.value.status == 404


# ---------------------------------------------------------------- storage


def test_records_are_atomic_versioned_and_integrity_checked(tmp_path: Path) -> None:
    store = AdminStore(tmp_path)
    record = store.create("drafts", {"status": "draft", "content": {"title": "A"}})
    assert record["version"] == 1 and store.get("drafts", record["id"]) == record
    updated = store.update("drafts", record["id"], 1, lambda r: {**r, "content": {"title": "B"}})
    assert updated["version"] == 2 and updated["createdAt"] == record["createdAt"]
    with pytest.raises(VersionConflict) as conflict:
        store.update("drafts", record["id"], 1, lambda r: r)
    assert conflict.value.current == 2
    # No temporary files are left behind.
    assert [p.name for p in (tmp_path / "drafts").iterdir()] == [f"{record['id']}.json"]
    # Tampering on disk is detected.
    path = tmp_path / "drafts" / f"{record['id']}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["status"] = "content_approved"
    path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(IntegrityError):
        store.get("drafts", record["id"])
    path.write_bytes(bytes([0x96]) + b" not json")
    with pytest.raises(IntegrityError):
        store.get("drafts", record["id"])


@pytest.mark.parametrize(
    "bad_id",
    ["../../content/experiments/exp04/definition.v1", "..", "a" * 31, "A" * 32, "x/../y", ""],
)
def test_identifiers_cannot_traverse_paths(tmp_path: Path, bad_id: str) -> None:
    store = AdminStore(tmp_path)
    with pytest.raises(StoreError):
        store.get("drafts", bad_id)
    with pytest.raises(StoreError):
        store.get("../uploads", "a" * 32)


def test_uploads_are_content_addressed_and_never_overwritten(tmp_path: Path) -> None:
    store = AdminStore(tmp_path)
    sha = store.save_upload(b"%PDF-1.4 first")
    assert store.save_upload(b"%PDF-1.4 first") == sha  # idempotent
    path = store.upload_path(sha)
    path.write_bytes(b"tampered")
    with pytest.raises(IntegrityError):
        store.save_upload(b"%PDF-1.4 first")
    assert not store.upload_ok(sha)
    with pytest.raises(StoreError):
        store.upload_path("../" + "a" * 61)


def test_create_never_overwrites_an_existing_record(tmp_path: Path) -> None:
    store = AdminStore(tmp_path)
    first = store.create("drafts", {"status": "draft"})
    with pytest.raises(StoreError):
        store.create("drafts", {"id": first["id"], "status": "draft"})
