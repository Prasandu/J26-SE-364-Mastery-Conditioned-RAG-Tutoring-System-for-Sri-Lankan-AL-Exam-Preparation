"""Admin management features: content duplicates, knowledge feed, library, users, documents,
translations, audit log, settings view and local AI suggestions (all offline: fake embeddings
and a fake local extraction assistant; no network, no database)."""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.admin.assist import FakeExtractionAssistant, verify
from app.main import create_app
from app.settings import ConfigurationError, Settings

from .pdf_fixture import write_pdf
from .test_admin_access import admin_settings
from .test_admin_api import BASE, COMPLETE, LOCAL, pdf, review, upload

ROUTES = [
    ("get", "/admin/dev/knowledge"),
    ("get", "/admin/dev/library"),
    ("get", "/admin/dev/users"),
    ("get", "/admin/dev/documents"),
    ("get", "/admin/dev/translations"),
    ("get", "/admin/dev/audit"),
    ("get", "/admin/dev/settings"),
]


def feed_settings(tmp_path: Path, **over: Any) -> Settings:
    return admin_settings(
        tmp_path,
        embedding_provider="fake",
        knowledge_manifest=tmp_path / "no-manifest.json",  # never the private corpus
        **over,
    )


def client_for(settings: Settings, **kwargs: Any) -> TestClient:
    return TestClient(create_app(settings, **kwargs), base_url=BASE, client=LOCAL)


@pytest.fixture
def lab(tmp_path: Path) -> Iterator[TestClient]:
    with client_for(feed_settings(tmp_path)) as client:
        yield client


def approved_draft(client: TestClient, tmp_path: Path, variant: str = "") -> dict[str, Any]:
    pages = [COMPLETE + ([variant] if variant else [])]
    result = upload(client, pdf(tmp_path, pages, name=f"d{len(variant)}.pdf"), kind="single")
    detail = client.get(f"/admin/dev/drafts/{result.json()['drafts'][0]['id']}").json()
    current = review(client, detail["draft"], "submit_for_review").json()
    for name in current["validation"]["unreviewedFields"]:
        current = review(client, current["draft"], "mark_field", field=name, reviewed=True).json()
    approved = review(client, current["draft"], "approve_content").json()
    assert approved["draft"]["status"] == "content_approved", approved["validation"]["blocking"]
    return dict(approved["draft"])


# ------------------------------------------------------------------ guard and settings


def test_management_routes_are_404_when_admin_is_off_or_not_local(tmp_path: Path) -> None:
    off = admin_settings(tmp_path, admin_mode="disabled")
    with client_for(off) as client:
        for method, path in ROUTES:
            assert getattr(client, method)(path).status_code == 404
    with TestClient(
        create_app(feed_settings(tmp_path)), base_url=BASE, client=("192.168.1.20", 5000)
    ) as remote:
        for method, path in ROUTES:
            assert getattr(remote, method)(path).status_code == 404


def test_ollama_and_database_settings_are_validated(tmp_path: Path) -> None:
    with pytest.raises(ConfigurationError, match="LAB_OLLAMA_MODEL"):
        admin_settings(tmp_path, llm_provider="ollama").validate_for_startup()
    with pytest.raises(ConfigurationError, match="loopback"):
        admin_settings(
            tmp_path,
            llm_provider="ollama",
            ollama_model="qwen3:8b",
            ollama_base_url="http://10.0.0.5:11434/v1",
        ).validate_for_startup()
    admin_settings(tmp_path, llm_provider="ollama", ollama_model="qwen3:8b").validate_for_startup()
    with pytest.raises(ConfigurationError, match="LAB_DATABASE_URL"):
        admin_settings(tmp_path, admin_repository="postgres").validate_for_startup()
    with pytest.raises(ConfigurationError, match="LAB_DATABASE_URL"):
        admin_settings(tmp_path, knowledge_repository="postgres").validate_for_startup()
    with pytest.raises(ConfigurationError, match="fake extraction"):
        admin_settings(tmp_path, admin_extraction_assist="fake").validate_for_startup()


def test_settings_view_never_exposes_secrets(tmp_path: Path) -> None:
    secret = "sk-test-should-never-appear"  # noqa: S105 - fake value for a leak test
    with client_for(feed_settings(tmp_path, OPENAI_API_KEY=secret)) as client:
        body = client.get("/admin/dev/settings")
        assert body.status_code == 200
        assert secret not in body.text
        data = body.json()
        assert data["generation"]["openaiKeyConfigured"] is True
        assert data["loginEnabled"] is False


# ------------------------------------------------------------------ content duplicates


def test_near_identical_content_with_a_different_number_blocks_until_marked_distinct(
    lab: TestClient, tmp_path: Path
) -> None:
    first = upload(lab, pdf(tmp_path, [COMPLETE], name="a.pdf"), kind="single").json()
    renumbered = [line.replace("Experiment 9", "Experiment 11") for line in COMPLETE]
    second = upload(lab, pdf(tmp_path, [renumbered], name="b.pdf"), kind="single").json()
    detail = lab.get(f"/admin/dev/drafts/{second['drafts'][0]['id']}").json()
    found = [d for d in detail["validation"]["duplicates"] if d["kind"] == "content"]
    assert found and found[0]["otherId"] == first["drafts"][0]["id"]
    assert found[0]["similarity"] >= 0.6 and found[0]["blocking"] is True
    assert any(b.startswith("duplicate:content:") for b in detail["validation"]["blocking"])
    # Dismissing needs an actual content duplicate.
    bad = review(lab, detail["draft"], "mark_distinct", otherId="f" * 32)
    assert bad.status_code == 409
    marked = review(lab, detail["draft"], "mark_distinct", otherId=first["drafts"][0]["id"])
    assert marked.status_code == 200
    after = [d for d in marked.json()["validation"]["duplicates"] if d["kind"] == "content"]
    assert after[0]["blocking"] is False
    assert not any(
        b.startswith("duplicate:content") for b in marked.json()["validation"]["blocking"]
    )


def test_published_content_and_number_matches_are_informational(
    lab: TestClient, tmp_path: Path
) -> None:
    exp4 = ["Unit 03", "Experiment 4: Preparation of standard solutions", "Procedure:", "- Weigh."]
    result = upload(lab, pdf(tmp_path, [exp4]), kind="single").json()
    detail = lab.get(f"/admin/dev/drafts/{result['drafts'][0]['id']}").json()
    published = [d for d in detail["validation"]["duplicates"] if d["kind"] == "published"]
    assert published and published[0]["blocking"] is False


# ------------------------------------------------------------------ knowledge feed


def test_knowledge_feed_builds_checks_and_activates_a_version(
    lab: TestClient, tmp_path: Path
) -> None:
    overview = lab.get("/admin/dev/knowledge").json()
    assert overview["available"] is True and overview["active"] is None
    draft = approved_draft(lab, tmp_path)
    built = lab.post("/admin/dev/knowledge/builds", json={"draftIds": [draft["id"]]})
    assert built.status_code == 201, built.text
    record = built.json()
    assert record["status"] == "staged" and record["newChunks"] > 0
    assert record["checkPassed"] is True and record["baseVersion"] is None
    version = record["knowledgeVersion"]
    # Staged is not active: the assistant still has no knowledge until activation.
    assert lab.get("/admin/dev/knowledge").json()["active"] is None

    chunks = lab.get(f"/admin/dev/knowledge/{version}/chunks").json()
    assert chunks and all(c["experimentId"] == f"draft_{draft['id']}" for c in chunks)
    assert any("Procedure" in c["heading"] and "Dissolve the solid" in c["text"] for c in chunks)

    active = lab.post("/admin/dev/knowledge/activate", json={"knowledgeVersion": version})
    assert active.status_code == 200
    assert active.json()["active"]["knowledgeVersion"] == version
    assert active.json()["builds"][0]["status"] == "active"
    runtime = lab.app.state.lab.knowledge  # type: ignore[attr-defined]
    assert runtime.repository.active().knowledge_version == version  # shared with the assistant
    persisted = tmp_path / "admin" / "knowledge"
    assert json.loads((persisted / "active.json").read_text())["active"] == version
    assert (persisted / version / "chunks.jsonl").is_file()

    # Rebuilding the same draft replaces its chunks; identical text is not stored twice.
    again = lab.post("/admin/dev/knowledge/builds", json={"draftIds": [draft["id"]]}).json()
    assert again["baseVersion"] == version
    assert again["chunkCount"] == record["chunkCount"]
    assert again["carriedChunks"] == 0


def test_knowledge_feed_rejects_unapproved_drafts_and_missing_embeddings(
    tmp_path: Path,
) -> None:
    with client_for(feed_settings(tmp_path)) as lab:
        result = upload(lab, pdf(tmp_path, [COMPLETE]), kind="single").json()
        refused = lab.post(
            "/admin/dev/knowledge/builds", json={"draftIds": [result["drafts"][0]["id"]]}
        )
        assert refused.status_code == 409
        assert refused.json()["error"]["code"] == "knowledge_build_rejected"
        unknown = lab.post("/admin/dev/knowledge/activate", json={"knowledgeVersion": "kb-x"})
        assert unknown.status_code == 404
    with client_for(admin_settings(tmp_path / "off")) as lab:
        draft = approved_draft(lab, tmp_path)
        overview = lab.get("/admin/dev/knowledge").json()
        assert overview["available"] is False
        assert overview["reason"] == "embedding_provider_disabled"
        built = lab.post("/admin/dev/knowledge/builds", json={"draftIds": [draft["id"]]})
        assert built.status_code == 409
        assert built.json()["error"]["code"] == "knowledge_unavailable"


def test_activated_knowledge_survives_a_restart(tmp_path: Path) -> None:
    with client_for(feed_settings(tmp_path)) as lab:
        draft = approved_draft(lab, tmp_path)
        version = lab.post("/admin/dev/knowledge/builds", json={"draftIds": [draft["id"]]}).json()[
            "knowledgeVersion"
        ]
        lab.post("/admin/dev/knowledge/activate", json={"knowledgeVersion": version})
    with client_for(feed_settings(tmp_path)) as restarted:
        assert restarted.get("/admin/dev/knowledge").json()["active"]["knowledgeVersion"] == version


# ------------------------------------------------------------------ library


def test_library_lists_published_and_approved_practicals_with_readiness(
    lab: TestClient, tmp_path: Path
) -> None:
    draft = approved_draft(lab, tmp_path)
    entries = lab.get("/admin/dev/library").json()["entries"]
    published = next(e for e in entries if e["kind"] == "published")
    assert published["runnable"] is True and published["experimentNumber"] == 4
    mine = next(e for e in entries if e["id"] == draft["id"])
    assert mine["runnable"] is False and mine["status"] == "content_approved"
    assert "simulation_definition_missing" in mine["blockers"]
    assert mine["knowledgeChunks"] == 0
    version = lab.post("/admin/dev/knowledge/builds", json={"draftIds": [draft["id"]]}).json()
    lab.post(
        "/admin/dev/knowledge/activate", json={"knowledgeVersion": version["knowledgeVersion"]}
    )
    mine = next(
        e for e in lab.get("/admin/dev/library").json()["entries"] if e["id"] == draft["id"]
    )
    assert mine["knowledgeChunks"] > 0


# ------------------------------------------------------------------ users


def test_user_directory_is_pseudonymous_versioned_and_not_enforced(lab: TestClient) -> None:
    body = {"expectedVersion": None, "displayName": "Learner 07", "role": "student",
            "status": "active", "note": ""}  # fmt: skip
    created = lab.post("/admin/dev/users", json=body)
    assert created.status_code == 201
    user = created.json()
    for bad in ("someone@example.com", "077 123 4567"):
        refused = lab.post("/admin/dev/users", json={**body, "displayName": bad})
        assert refused.status_code == 422
    updated = lab.put(
        f"/admin/dev/users/{user['id']}",
        json={**body, "expectedVersion": user["version"], "role": "teacher"},
    )
    assert updated.status_code == 200 and updated.json()["role"] == "teacher"
    stale = lab.put(
        f"/admin/dev/users/{user['id']}", json={**body, "expectedVersion": user["version"]}
    )
    assert stale.status_code == 409
    listing = lab.get("/admin/dev/users").json()
    assert listing["rolesEnforced"] is False
    assert [u["displayName"] for u in listing["users"]] == ["Learner 07"]
    assert isinstance(listing["learnerData"], list)


# ------------------------------------------------------------------ documents and translations


def test_documents_register_and_licence_note(lab: TestClient, tmp_path: Path) -> None:
    upload(lab, pdf(tmp_path, [COMPLETE]), kind="single")
    docs = lab.get("/admin/dev/documents").json()
    assert len(docs) == 1 and docs[0]["fileOk"] is True and docs[0]["licenceNote"] == ""
    noted = lab.put(
        f"/admin/dev/documents/{docs[0]['importId']}",
        json={"expectedVersion": docs[0]["version"], "licenceNote": "NIE, classroom use"},
    )
    assert noted.status_code == 200 and noted.json()["licenceNote"] == "NIE, classroom use"


def test_translation_status_and_review_sheet(lab: TestClient) -> None:
    files = {t["file"]: t for t in lab.get("/admin/dev/translations").json()}
    assert files["ui"]["status"] == "draft" and files["ui"]["keys"] > 100
    sheet = lab.get("/admin/dev/translations/exp04.csv")
    assert sheet.status_code == 200 and sheet.headers["content-type"].startswith("text/csv")
    assert sheet.text.lstrip("﻿").startswith("key,english,sinhala_draft")
    assert lab.get("/admin/dev/translations/..%2Fsecrets.csv").status_code == 404
    assert lab.get("/admin/dev/translations/nothere.csv").status_code == 404


# ------------------------------------------------------------------ audit log


def test_every_change_is_audited_and_tampering_is_detected(lab: TestClient, tmp_path: Path) -> None:
    approved_draft(lab, tmp_path)
    audit = lab.get("/admin/dev/audit").json()
    actions = [e["action"] for e in audit["events"]]
    assert audit["chainOk"] is True
    assert "import.created" in actions and "draft.approve_content" in actions
    assert all(e["actor"] == "local-admin" for e in audit["events"])
    log = tmp_path / "admin" / "audit.jsonl"
    lines = log.read_text(encoding="utf-8").splitlines()
    first = json.loads(lines[0])
    first["details"]["drafts"] = 99
    log.write_text("\n".join([json.dumps(first), *lines[1:]]) + "\n", encoding="utf-8")
    assert lab.get("/admin/dev/audit").json()["chainOk"] is False


# ------------------------------------------------------------------ local AI suggestions


def test_suggestions_are_off_unless_a_local_assistant_is_configured(
    lab: TestClient, tmp_path: Path
) -> None:
    result = upload(lab, pdf(tmp_path, [COMPLETE]), kind="single").json()
    draft = lab.get(f"/admin/dev/drafts/{result['drafts'][0]['id']}").json()["draft"]
    refused = lab.post(
        f"/admin/dev/drafts/{draft['id']}/suggest",
        json={"expectedVersion": draft["version"], "fields": ["observations"]},
    )
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "assist_unavailable"


def test_only_suggestions_quoted_from_the_page_are_kept(tmp_path: Path) -> None:
    def script(title: str, fields: list[str], pages: dict[int, str]) -> list[dict[str, Any]]:
        def item(field: str, text: str, quote: str, page: int) -> dict[str, Any]:
            return {"field": field, "text": text, "quote": quote, "page": page}

        return [
            item("observations", "Wear safety goggles", "Wear safety goggles.", 1),
            item("observations", "Solution turns pink", "Solution turns pink", 1),
            item("observations", "Beaker", "Beaker", 7),
            item("aims", "Dissolve", "Dissolve the solid", 1),
        ]

    fake = FakeExtractionAssistant(script)
    with client_for(feed_settings(tmp_path), extraction_assistant=fake) as lab:
        result = upload(lab, pdf(tmp_path, [COMPLETE]), kind="single").json()
        draft = lab.get(f"/admin/dev/drafts/{result['drafts'][0]['id']}").json()["draft"]
        response = lab.post(
            f"/admin/dev/drafts/{draft['id']}/suggest",
            json={"expectedVersion": draft["version"], "fields": ["observations"]},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        # Kept: the quoted sentence that is on page 1. Rejected: invented text, a page outside
        # the practical, and a field that was not requested.
        assert body["accepted"] == 1 and body["rejected"] == 3
        suggestions = body["detail"]["draft"]["suggestions"]["observations"]
        assert suggestions == [
            {"text": "Wear safety goggles", "page": 1, "quote": "Wear safety goggles."}
        ]
        # Suggestions never change the draft content by themselves.
        assert body["detail"]["draft"]["content"] == draft["content"]
        title, fields, pages = fake.calls[0]
        assert fields == ["observations"] and set(pages) == {1}


def test_verify_requires_the_text_inside_a_verbatim_page_quote() -> None:
    pages = {2: "Procedure:\n- Weigh 2.0 g of the solid on a watch glass."}
    good = {"field": "procedure", "text": "Weigh 2.0 g of the solid", "page": 2,
            "quote": "Weigh 2.0 g of the solid on a watch glass."}  # fmt: skip
    changed_number = {**good, "text": "Weigh 3.0 g of the solid"}
    accepted, rejected = verify([good, changed_number], pages, ["procedure"])
    assert [s["text"] for s in accepted["procedure"]] == ["Weigh 2.0 g of the solid"]
    assert rejected == 1


def test_pdf_fixture_is_synthetic(tmp_path: Path) -> None:
    # Guard: these tests only ever use generated PDFs, never the private NIE documents.
    path = write_pdf(tmp_path / "x.pdf", [["Experiment 1: Synthetic"]])
    assert path.read_bytes().startswith(b"%PDF-")


# ------------------------------------------------------------------ quick fix / approve now


def test_long_paragraphs_are_split_at_sentences_and_placeholders_removed() -> None:
    from app.admin.drafts import MAX_ITEM_CHARS, clean_items, split_long

    sentence = "Calculate the molar mass of the gas from the recorded data carefully. "
    long_item = sentence * 40
    parts = split_long(long_item.strip())
    assert len(parts) > 1 and all(len(p) <= MAX_ITEM_CHARS for p in parts)
    assert " ".join(parts) == long_item.strip()  # nothing lost or rewritten
    assert clean_items(
        ["Discussion: ..........", "Record the mass.", "Record the mass.", "____"]
    ) == [
        "Discussion",
        "Record the mass.",
    ]


def test_quick_fix_then_approve_now_for_a_practical_without_precautions(
    lab: TestClient, tmp_path: Path
) -> None:
    from .test_admin_api import INCOMPLETE

    result = upload(lab, pdf(tmp_path, [INCOMPLETE]), kind="single").json()
    detail = lab.get(f"/admin/dev/drafts/{result['drafts'][0]['id']}").json()
    assert "missing:precautions" in detail["validation"]["blocking"]
    refused = review(lab, detail["draft"], "quick_approve")
    assert refused.status_code == 409

    fixed = review(lab, detail["draft"], "quick_fix").json()
    draft = fixed["draft"]
    assert set(draft["absentConfirmed"]) == {"aims", "apparatus", "precautions"}
    assert "absent:precautions" in draft["quickFixLog"]
    assert fixed["validation"]["blocking"] == []
    assert "absent_confirmed:precautions" in fixed["validation"]["warnings"]

    approved = review(lab, draft, "quick_approve").json()
    assert approved["draft"]["status"] == "content_approved"
    assert approved["draft"]["quickApproved"] is True
    assert approved["validation"]["runnable"] is False
    actions = [e["action"] for e in lab.get("/admin/dev/audit").json()["events"]]
    assert "draft.quick_fix" in actions and "draft.quick_approve" in actions

    # Adding real precautions later removes the "not given" confirmation and needs review again.
    content = {**approved["draft"]["content"], "precautions": ["Wear safety goggles."]}
    edited = lab.put(
        f"/admin/dev/drafts/{draft['id']}",
        json={
            "expectedVersion": approved["draft"]["version"],
            "content": content,
            "sourcePages": {**approved["draft"]["sourcePages"], "precautions": [1]},
        },
    ).json()
    assert "precautions" not in edited["draft"]["absentConfirmed"]
    assert edited["draft"]["status"] == "needs_review"
    assert edited["draft"]["quickApproved"] is False


def test_quick_fix_repairs_over_long_items_from_older_imports(
    lab: TestClient, tmp_path: Path
) -> None:
    result = upload(lab, pdf(tmp_path, [COMPLETE]), kind="single").json()
    draft_id = result["drafts"][0]["id"]
    store_path = tmp_path / "admin" / "drafts" / f"{draft_id}.json"
    from app.admin.store import AdminStore

    store = AdminStore(tmp_path / "admin")
    long_text = "Measure the temperature and pressure of the gas carefully. " * 50
    store.update(
        "drafts",
        draft_id,
        1,
        lambda r: {**r, "content": {**r["content"], "calculations": [long_text.strip()]},
                   "sourcePages": {**r["sourcePages"], "calculations": [1]}},
    )  # fmt: skip
    assert store_path.is_file()
    detail = lab.get(f"/admin/dev/drafts/{draft_id}")
    assert detail.status_code == 200  # an older over-long draft still opens
    fixed = review(lab, detail.json()["draft"], "quick_fix").json()
    items = fixed["draft"]["content"]["calculations"]
    assert len(items) > 1 and all(len(i) <= 1000 for i in items)
    assert "cleaned:calculations" in fixed["draft"]["quickFixLog"]
