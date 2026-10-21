"""Data-only local authoring: real file persistence, guards, validation and version checks."""

import copy
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import REPO_ROOT, Settings

from .test_admin_access import admin_settings
from .test_admin_api import BASE, LOCAL

DEFINITIONS: list[dict[str, Any]] = json.loads(
    (REPO_ROOT / "content/experiments/teaching/handbook21-30.v1.json").read_text(encoding="utf-8")
)
ROOT = "/admin/dev/simulation-models"


def package() -> dict[str, Any]:
    d = copy.deepcopy(DEFINITIONS[0])
    d.update(id="local-complex-comparison", experimentNumber=31)
    return d


@pytest.fixture
def local(tmp_path: Path) -> Iterator[TestClient]:
    with TestClient(create_app(admin_settings(tmp_path)), base_url=BASE, client=LOCAL) as client:
        yield client


def test_every_bundled_definition_has_matching_python_semantics() -> None:
    from app.admin.teaching_routes import semantic_issues

    for definition in DEFINITIONS:
        assert semantic_issues(definition) == []


def test_save_activate_reload_and_edit_preserve_public_catalog(local: TestClient) -> None:
    before = local.get("/experiments").json()
    definition = package()
    result = local.post(ROOT, json={"expectedVersion": None, "definition": definition})
    assert result.status_code == 201, result.text
    record = result.json()
    assert record["status"] == "staged" and record["review"] is None
    assert record["definition"] == definition
    assert "integrity" not in record
    activated = local.post(
        f"{ROOT}/{record['id']}/activate-local",
        json={"expectedVersion": 1, "reviewer": "Local test reviewer", "reviewedSources": True},
    )
    assert activated.status_code == 200, activated.text
    assert activated.json()["status"] == "local_active"
    assert activated.json()["review"]["reviewer"] == "Local test reviewer"
    assert local.get(ROOT).json()[0]["version"] == 2
    definition["revision"] = 2
    edited = local.put(
        f"{ROOT}/{record['id']}", json={"expectedVersion": 2, "definition": definition}
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["status"] == "staged" and edited.json()["review"] is None
    assert local.get("/experiments").json() == before
    audit = local.get("/admin/dev/audit").json()
    assert "simulation.saved" in json.dumps(audit)
    assert "simulation.activated_local" in json.dumps(audit)


def test_optimistic_versions_and_identity_are_enforced(local: TestClient) -> None:
    d = package()
    r = local.post(ROOT, json={"expectedVersion": None, "definition": d}).json()
    d["revision"] = 2
    assert (
        local.put(f"{ROOT}/{r['id']}", json={"expectedVersion": 9, "definition": d}).status_code
        == 409
    )
    assert (
        local.post(
            f"{ROOT}/{r['id']}/activate-local",
            json={"expectedVersion": 9, "reviewer": "A", "reviewedSources": True},
        ).status_code
        == 409
    )
    assert (
        local.post(
            f"{ROOT}/{r['id']}/activate-local",
            json={"expectedVersion": 1, "reviewer": "A", "reviewedSources": False},
        ).status_code
        == 422
    )
    assert (
        local.post(
            f"{ROOT}/{r['id']}/activate-local",
            json={"expectedVersion": 1, "reviewer": "   ", "reviewedSources": True},
        ).status_code
        == 422
    )
    assert local.post(ROOT, json={"expectedVersion": None, "definition": d}).status_code == 409
    d["experimentNumber"] = 32
    assert (
        local.put(f"{ROOT}/{r['id']}", json={"expectedVersion": 1, "definition": d}).status_code
        == 422
    )


def test_deactivation_is_versioned_and_clears_review(local: TestClient) -> None:
    r = local.post(ROOT, json={"expectedVersion": None, "definition": package()}).json()
    path = f"{ROOT}/{r['id']}"
    local.post(
        path + "/activate-local",
        json={"expectedVersion": 1, "reviewer": "A", "reviewedSources": True},
    )
    assert local.post(path + "/deactivate-local", json={"expectedVersion": 1}).status_code == 409
    stopped = local.post(path + "/deactivate-local", json={"expectedVersion": 2})
    assert stopped.status_code == 200
    assert stopped.json()["status"] == "staged"
    assert stopped.json()["review"] is None
    assert stopped.json()["version"] == 3


@pytest.mark.parametrize(
    "change",
    ["reserved", "script", "instrument", "missing_outcome", "source", "whitespace", "layout"],
)
def test_invalid_or_unsupported_packages_are_never_saved(local: TestClient, change: str) -> None:
    d = package()
    if change == "reserved":
        d["experimentNumber"] = 4
    elif change == "script":
        d["script"] = "fetch('https://example.invalid')"
    elif change == "instrument":
        d["apparatus"][0]["kind"] = "custom_glb_script"
    elif change == "missing_outcome":
        d["outcomes"].pop()
    elif change == "source":
        d["outcomes"][0]["sourceIndexes"] = [99]
    elif change == "whitespace":
        d["title"]["si"] = "  "
    elif change == "layout":
        d["layout"] = "gas_collection"
    result = local.post(ROOT, json={"expectedVersion": None, "definition": d})
    assert result.status_code == 422, result.text
    assert local.get(ROOT).json() == []


def test_records_survive_api_restart(tmp_path: Path) -> None:
    settings = admin_settings(tmp_path)
    with TestClient(create_app(settings), base_url=BASE, client=LOCAL) as first:
        saved = first.post(ROOT, json={"expectedVersion": None, "definition": package()})
        assert saved.status_code == 201
    with TestClient(create_app(settings), base_url=BASE, client=LOCAL) as restarted:
        assert restarted.get(ROOT).json()[0]["id"] == saved.json()["id"]


@pytest.mark.parametrize(
    "peer,headers",
    [
        (("198.51.100.1", 40000), {}),
        (LOCAL, {"X-Forwarded-For": "127.0.0.1"}),
        (LOCAL, {"Origin": "https://example.invalid"}),
    ],
)
def test_all_endpoints_keep_loopback_guard(
    tmp_path: Path, peer: tuple[str, int], headers: dict[str, str]
) -> None:
    with TestClient(create_app(admin_settings(tmp_path)), base_url=BASE, client=peer) as client:
        for method, path, body in [
            ("GET", ROOT, None),
            ("POST", ROOT, {"expectedVersion": None, "definition": package()}),
            ("PUT", ROOT + "/" + "a" * 32, {}),
            ("POST", ROOT + "/" + "a" * 32 + "/activate-local", {}),
            ("POST", ROOT + "/" + "a" * 32 + "/deactivate-local", {}),
        ]:
            assert client.request(method, path, json=body, headers=headers).status_code == 404


def test_disabled_admin_has_no_authoring_access() -> None:
    with TestClient(
        create_app(Settings(_env_file=None, llm_provider="disabled")), base_url=BASE, client=LOCAL
    ) as client:
        assert client.get(ROOT).status_code == 404
