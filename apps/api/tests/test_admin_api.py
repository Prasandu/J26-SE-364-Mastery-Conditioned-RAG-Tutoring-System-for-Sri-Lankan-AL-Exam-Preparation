"""Development-admin API end to end (C3): access, uploads, drafts, validation and review.

Offline: synthetic PDFs only, a temporary data directory, no providers.
"""

import hashlib
import io
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter

from app.main import create_app
from app.settings import REPO_ROOT

from .conftest import make_settings
from .pdf_fixture import write_pdf
from .test_admin_access import admin_settings

LOCAL = ("127.0.0.1", 51000)
BASE = "http://127.0.0.1:8000"

COMPLETE = [
    "Unit 06 - Example unit",
    "Experiment 9: A complete practical",
    "Aims:",
    "1. To test the admin workflow",
    "Equipment and chemicals required:",
    "Equipment",
    "Chemicals",
    "Beaker",
    "NaCl(s)",
    "Precautions:",
    "Wear safety goggles.",
    "Procedure:",
    "- Dissolve the solid in water.",
]
INCOMPLETE = ["Unit 06 - Example unit", "Experiment 10: Only a procedure", "Procedure:", "- Mix."]
EXP4 = ["Unit 03 - Chemical Calculations", "Experiment 4: Preparation of standard solutions",
        "Procedure:", "- Weigh the solid."]  # fmt: skip


def pdf(tmp_path: Path, pages: list[list[str]], name: str = "doc.pdf") -> bytes:
    return write_pdf(tmp_path / name, pages).read_bytes()


@pytest.fixture
def admin(tmp_path: Path) -> Iterator[TestClient]:
    app = create_app(admin_settings(tmp_path))
    with TestClient(app, base_url=BASE, client=LOCAL) as client:
        yield client


def upload(client: TestClient, data: bytes, kind: str = "guide", **headers: str) -> Any:
    return client.post(
        f"/admin/dev/imports?kind={kind}&filename=guide.pdf",
        content=data,
        headers={"Content-Type": "application/pdf", **headers},
    )


def contract(client: TestClient, schema: str, body: Any) -> None:
    registry = client.app.state.lab.contracts  # type: ignore[attr-defined]
    assert registry.is_valid(schema, body), registry.errors(schema, body)


# ---------------------------------------------------------------- access


def test_admin_routes_are_404_when_disabled() -> None:
    app = create_app(make_settings())
    with TestClient(app, base_url=BASE, client=LOCAL) as client:
        for method, path in (
            ("get", "/admin/dev/status"),
            ("get", "/admin/dev/drafts"),
            ("post", "/admin/dev/imports?kind=guide"),
        ):
            assert getattr(client, method)(path).status_code == 404


def test_enabled_admin_is_local_only(tmp_path: Path) -> None:
    app = create_app(admin_settings(tmp_path))
    with TestClient(app, base_url=BASE, client=("203.0.113.7", 4000)) as remote:
        assert remote.get("/admin/dev/status").status_code == 404
        assert remote.get("/admin/dev/status", headers={"X-Admin": "1"}).status_code == 404
    with TestClient(app, base_url="http://lab.example.org", client=LOCAL) as rebinding:
        assert rebinding.get("/admin/dev/status").status_code == 404
    with TestClient(app, base_url=BASE, client=LOCAL) as local:
        status = local.get("/admin/dev/status")
        assert status.status_code == 200
        contract(local, "api-admin-status", status.json())
        assert status.json()["limits"] == {"maxUploadBytes": 25 * 1024 * 1024, "maxPages": 400}
        for spoof in (
            {"X-Forwarded-For": "203.0.113.9"},
            {"Forwarded": "for=203.0.113.9"},
            {"Origin": "https://evil.example"},
        ):
            assert local.get("/admin/dev/status", headers=spoof).status_code == 404
        allowed = local.get("/admin/dev/status", headers={"Origin": "http://localhost:5173"})
        assert allowed.status_code == 200


def test_student_api_is_unaffected_by_admin_mode(admin: TestClient) -> None:
    assert admin.get("/experiments").status_code == 200
    assert admin.get("/health").status_code == 200


# ---------------------------------------------------------------- uploads


def test_upload_requires_pdf_content_type_and_signature(admin: TestClient, tmp_path: Path) -> None:
    good = pdf(tmp_path, [COMPLETE])
    wrong_type = admin.post(
        "/admin/dev/imports?kind=guide", content=good, headers={"Content-Type": "text/plain"}
    )
    assert wrong_type.status_code == 415
    renamed = upload(admin, b"MZ\x90\x00 executable bytes named guide.pdf")
    assert renamed.status_code == 422 and renamed.json()["error"]["code"] == "document_invalid"
    assert upload(admin, b"").json()["error"]["code"] == "document_invalid"
    assert upload(admin, good, kind="everything").status_code == 422


def test_upload_size_limit(tmp_path: Path) -> None:
    app = create_app(admin_settings(tmp_path, admin_max_upload_bytes=2048))
    with TestClient(app, base_url=BASE, client=LOCAL) as client:
        big = b"%PDF-1.4\n" + b"0" * 4096
        response = upload(client, big)
        assert response.status_code == 413
        assert response.json()["error"]["code"] == "request_too_large"


def test_encrypted_and_corrupt_uploads(admin: TestClient, tmp_path: Path) -> None:
    writer = PdfWriter(clone_from=PdfReader(io.BytesIO(pdf(tmp_path, [COMPLETE]))))
    writer.encrypt(user_password="", owner_password="owner")  # noqa: S106 - throwaway test PDF
    buffer = io.BytesIO()
    writer.write(buffer)
    assert upload(admin, buffer.getvalue()).json()["error"]["code"] == "document_encrypted"
    corrupt = upload(admin, b"%PDF-1.7\n1 0 obj << broken")
    assert corrupt.json()["error"]["code"] == "document_invalid"
    assert "Traceback" not in corrupt.text and "pypdf" not in corrupt.text


def test_page_limit(tmp_path: Path) -> None:
    app = create_app(admin_settings(tmp_path, admin_max_pages=2))
    with TestClient(app, base_url=BASE, client=LOCAL) as client:
        response = upload(client, pdf(tmp_path, [COMPLETE, INCOMPLETE, EXP4]))
        assert response.json()["error"]["code"] == "document_too_many_pages"


def test_single_import_rejects_multi_practical_documents(admin: TestClient, tmp_path: Path) -> None:
    response = upload(admin, pdf(tmp_path, [COMPLETE, INCOMPLETE]), kind="single")
    assert response.status_code == 422 and response.json()["error"]["code"] == "multiple_practicals"


# ---------------------------------------------------------------- drafts and validation


def test_guide_import_stages_drafts_without_touching_the_catalog(
    admin: TestClient, tmp_path: Path
) -> None:
    before = admin.get("/experiments").json()
    definition = REPO_ROOT / "content" / "experiments" / "exp04" / "definition.v1.json"
    definition_hash = hashlib.sha256(definition.read_bytes()).hexdigest()
    response = upload(admin, pdf(tmp_path, [COMPLETE, INCOMPLETE, EXP4]))
    assert response.status_code == 201, response.text
    body = response.json()
    contract(admin, "api-admin-import-result", body)
    assert body["import"]["pageCount"] == 3 and len(body["drafts"]) == 3
    assert body["import"]["documentName"] == "guide.pdf"
    assert {d["status"] for d in body["drafts"]} == {"draft"}
    # The active catalog and the student definition files are unchanged.
    assert admin.get("/experiments").json() == before
    assert hashlib.sha256(definition.read_bytes()).hexdigest() == definition_hash
    stored = list((tmp_path / "admin").rglob("*"))
    assert all(str(p).startswith(str(tmp_path)) for p in stored)
    assert len(list((tmp_path / "admin" / "uploads").glob("*.pdf"))) == 1


def drafts_by_number(client: TestClient) -> dict[int | None, dict[str, Any]]:
    return {d["experimentNumber"]: d for d in client.get("/admin/dev/drafts").json()}


def test_validation_reports_missing_fields_duplicates_and_simulation(
    admin: TestClient, tmp_path: Path
) -> None:
    upload(admin, pdf(tmp_path, [COMPLETE, INCOMPLETE, EXP4]))
    by_number = drafts_by_number(admin)
    incomplete = admin.get(f"/admin/dev/drafts/{by_number[10]['id']}").json()
    contract(admin, "api-admin-draft-detail", incomplete)
    v = incomplete["validation"]
    assert v["contentComplete"] is False
    assert set(v["missingFields"]) == {"aims", "apparatus", "precautions"}
    assert v["runnable"] is False and v["simulation"]["status"] == "simulation_pending"
    assert v["sinhalaReview"] == "not_started"
    # Experiment 4 matches the published practical: informational, never a silent replacement.
    exp4 = admin.get(f"/admin/dev/drafts/{by_number[4]['id']}").json()["validation"]
    published = [d for d in exp4["duplicates"] if d["kind"] == "published"]
    assert published and published[0]["blocking"] is False
    assert published[0]["otherId"] == "exp04_standard_solution"
    assert published[0]["conflictingTitle"] is False
    # Importing the same guide again creates blocking draft duplicates.
    upload(admin, pdf(tmp_path, [COMPLETE], name="again.pdf"), kind="single")
    complete = [d for d in admin.get("/admin/dev/drafts").json() if d["experimentNumber"] == 9]
    assert len(complete) == 2
    detail = admin.get(f"/admin/dev/drafts/{complete[0]['id']}").json()["validation"]
    assert any(d["kind"] == "draft" and d["blocking"] for d in detail["duplicates"])


def complete_draft(client: TestClient, tmp_path: Path, variant: str = "") -> dict[str, Any]:
    pages = [COMPLETE + ([variant] if variant else [])]
    result = upload(client, pdf(tmp_path, pages, name=f"doc{variant}.pdf"), kind="single").json()
    return dict(client.get(f"/admin/dev/drafts/{result['drafts'][0]['id']}").json())


def review(client: TestClient, draft: dict[str, Any], action: str, **extra: Any) -> Any:
    body = {"expectedVersion": draft["version"], "action": action, "field": None, "reviewed": None}
    return client.post(f"/admin/dev/drafts/{draft['id']}/review", json={**body, **extra})


def test_review_workflow_and_content_approval_stays_non_runnable(
    admin: TestClient, tmp_path: Path
) -> None:
    detail = complete_draft(admin, tmp_path)
    draft = detail["draft"]
    assert detail["validation"]["contentComplete"] is True
    # Approval is refused before review and before submission.
    assert review(admin, draft, "approve_content").status_code == 409
    submitted = review(admin, draft, "submit_for_review").json()
    assert submitted["draft"]["status"] == "needs_review"
    refused = review(admin, submitted["draft"], "approve_content")
    assert (
        refused.status_code == 409
        and refused.json()["error"]["code"] == "review_transition_invalid"
    )
    current = submitted
    for name in current["validation"]["unreviewedFields"]:
        current = review(admin, current["draft"], "mark_field", field=name, reviewed=True).json()
    assert current["validation"]["canApproveContent"] is True
    approved = review(admin, current["draft"], "approve_content").json()
    assert approved["draft"]["status"] == "content_approved"
    assert approved["validation"]["runnable"] is False
    assert "simulation_definition_missing" in approved["validation"]["warnings"]
    # Editing approved content sends it back for review and resets that field.
    content = {**approved["draft"]["content"], "title": "A corrected title"}
    edited = admin.put(
        f"/admin/dev/drafts/{draft['id']}",
        json={
            "expectedVersion": approved["draft"]["version"],
            "content": content,
            "sourcePages": approved["draft"]["sourcePages"],
        },
    ).json()
    assert edited["draft"]["status"] == "needs_review"
    assert edited["draft"]["fieldReview"]["title"] is False
    assert edited["draft"]["fieldEdited"]["title"] is True
    assert "title" in edited["validation"]["unreviewedFields"]


def test_version_conflicts_and_invalid_edits(admin: TestClient, tmp_path: Path) -> None:
    draft = complete_draft(admin, tmp_path)["draft"]
    url = f"/admin/dev/drafts/{draft['id']}"
    payload = {"expectedVersion": draft["version"], "content": draft["content"],
               "sourcePages": draft["sourcePages"]}  # fmt: skip
    assert admin.put(url, json=payload).status_code == 200
    stale = admin.put(url, json=payload)
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "draft_version_conflict"
    assert stale.json()["error"]["details"]["currentVersion"] == draft["version"] + 1
    fresh = admin.get(url).json()["draft"]
    bad_pages = {**payload, "expectedVersion": fresh["version"], "sourcePages": {"aims": [99]}}
    assert admin.put(url, json=bad_pages).status_code == 422
    unknown = {**payload, "expectedVersion": fresh["version"], "sourcePages": {"secret": [1]}}
    assert admin.put(url, json=unknown).status_code == 422
    extra = {**payload, "expectedVersion": fresh["version"], "publish": True}
    assert admin.put(url, json=extra).status_code == 422
    too_long = {**payload, "expectedVersion": fresh["version"],
                "content": {**draft["content"], "aims": ["x" * 9000]}}  # fmt: skip
    assert admin.put(url, json=too_long).status_code == 422


def test_unsourced_manual_additions_block_approval(admin: TestClient, tmp_path: Path) -> None:
    result = upload(admin, pdf(tmp_path, [INCOMPLETE]), kind="single").json()
    draft = admin.get(f"/admin/dev/drafts/{result['drafts'][0]['id']}").json()["draft"]
    content = {**draft["content"], "aims": ["An aim typed by the administrator"]}
    edited = admin.put(
        f"/admin/dev/drafts/{draft['id']}",
        json={
            "expectedVersion": draft["version"],
            "content": content,
            "sourcePages": draft["sourcePages"],
        },  # fmt: skip
    ).json()
    assert "fields_without_source_pages" in edited["validation"]["provenanceIssues"]
    assert edited["validation"]["canApproveContent"] is False


def test_archiving_clears_duplicate_blocking(admin: TestClient, tmp_path: Path) -> None:
    first = complete_draft(admin, tmp_path)["draft"]
    second = complete_draft(admin, tmp_path, variant="Second printing.")["draft"]
    blocked = admin.get(f"/admin/dev/drafts/{first['id']}").json()["validation"]
    assert any(d["blocking"] for d in blocked["duplicates"])
    archived = review(admin, second, "archive").json()
    assert archived["draft"]["status"] == "archived"
    assert review(admin, archived["draft"], "submit_for_review").status_code == 409
    clear = admin.get(f"/admin/dev/drafts/{first['id']}").json()["validation"]
    assert not any(d["blocking"] for d in clear["duplicates"])


@pytest.mark.parametrize(
    "path",
    ["/admin/dev/drafts/..%2F..%2Fcontent", "/admin/dev/drafts/" + "A" * 32, "/admin/dev/drafts/x"],
)
def test_invalid_draft_identifiers_are_404(admin: TestClient, path: str) -> None:
    assert admin.get(path).status_code == 404


def test_tampered_draft_is_reported_not_served(admin: TestClient, tmp_path: Path) -> None:
    draft = complete_draft(admin, tmp_path)["draft"]
    path = tmp_path / "admin" / "drafts" / f"{draft['id']}.json"
    text = path.read_text(encoding="utf-8").replace('"draft"', '"content_approved"', 1)
    path.write_text(text, encoding="utf-8")
    response = admin.get(f"/admin/dev/drafts/{draft['id']}")
    assert response.status_code == 500 and response.json()["error"]["code"] == "admin_storage_error"


def test_unwritable_storage_is_a_contract_error_not_a_crash(
    admin: TestClient, tmp_path: Path
) -> None:
    # A file where the uploads folder belongs makes every filesystem write fail (OSError).
    (tmp_path / "admin").mkdir(exist_ok=True)
    (tmp_path / "admin" / "uploads").write_bytes(b"not a folder")
    response = upload(admin, pdf(tmp_path, [COMPLETE]))
    assert response.status_code == 500
    contract(admin, "api-error", response.json())
    assert response.json()["error"]["code"] == "admin_storage_error"
    assert response.headers.get("X-Correlation-ID")
    assert admin.get("/admin/dev/drafts").json() == []


def test_the_same_document_is_imported_once(admin: TestClient, tmp_path: Path) -> None:
    data = pdf(tmp_path, [COMPLETE])
    first = upload(admin, data, kind="single")
    assert first.status_code == 201
    again = upload(admin, data, kind="guide")
    assert again.status_code == 409
    error = again.json()["error"]
    assert error["code"] == "document_already_imported"
    assert error["details"]["importId"] == first.json()["import"]["id"]
    assert len(admin.get("/admin/dev/drafts").json()) == 1
