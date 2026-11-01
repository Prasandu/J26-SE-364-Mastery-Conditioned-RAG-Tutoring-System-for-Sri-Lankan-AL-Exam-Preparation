"""Development admin management endpoints: knowledge base, practical library overview, users,
learner data, source documents, translations, audit log, settings and local AI suggestions.

All handlers run the same loopback guard as the draft routes (404 when admin mode is off or the
request is not local). There is still no login: user records are a directory with roles that are
NOT enforced, and nothing here changes which practicals students can run.
"""

import csv
import io
import json
import logging
import re
from typing import Any

from fastapi import FastAPI, Request, Response
from pydantic import BaseModel, ConfigDict
from starlette.concurrency import run_in_threadpool

from app.admin.assist import AssistUnavailable, verify
from app.admin.common import AdminApi, published_texts, storage_errors
from app.admin.drafts import LIST_FIELDS, validate
from app.admin.extract import document_lines
from app.admin.ingest import DocumentRejected, extract_text
from app.admin.knowledge_feed import (
    FeedError,
    activate,
    build_version,
    draft_experiment_id,
)
from app.admin.store import AdminRepository, new_id
from app.errors import ApiError
from app.rag.repository import KnowledgeUnavailable

logger = logging.getLogger("vlab.admin")
ROLES = ("student", "teacher", "admin")
USER_STATUSES = ("active", "disabled")
LOCALE_FILE = re.compile(r"^[a-z0-9]{2,20}$")
#: Pseudonymous names only: reject anything that looks like an e-mail address or phone number.
CONTACT_DETAILS = re.compile(r"@|\+?\d[\d\s-]{6,}\d")


class KnowledgeBuildRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    draftIds: list[str]


class KnowledgeActivateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    knowledgeVersion: str


class UserRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    expectedVersion: int | None
    displayName: str
    role: str
    status: str
    note: str


class DocumentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    expectedVersion: int
    licenceNote: str


class SuggestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    expectedVersion: int
    fields: list[str]


def register_manage_routes(app: FastAPI, api: AdminApi) -> None:
    # ------------------------------------------------------------------ knowledge base
    def knowledge_overview(st: Any, store: AdminRepository) -> dict[str, Any]:
        runtime = st.knowledge
        builds = [api.public(b) for b in api.records(store, "knowledge")]
        active = None
        reason = None
        if runtime.repository is None or runtime.embeddings is None:
            reason = "embedding_provider_disabled"
        else:
            try:
                version = runtime.repository.active()
            except KnowledgeUnavailable:
                version, reason = None, "repository_unavailable"
            if version is not None:
                active = {
                    "knowledgeVersion": version.knowledge_version,
                    "chunkCount": version.chunk_count,
                    "embeddingModel": version.embedding_model,
                }
        return {
            "available": reason is None,
            "reason": reason,
            "repository": st.settings.knowledge_repository,
            "embeddingProvider": st.settings.embedding_provider,
            "embeddingModel": st.settings.embedding_model,
            "baseVersion": runtime.base_version,
            "active": active,
            "builds": list(reversed(builds)),
        }

    @app.get("/admin/dev/knowledge")
    def admin_knowledge(request: Request) -> dict[str, Any]:
        st, store = api.guard(request)
        return api.checked(st, "api-admin-knowledge", knowledge_overview(st, store))

    @app.post("/admin/dev/knowledge/builds", status_code=201)
    async def admin_knowledge_build(request: Request) -> dict[str, Any]:
        st, store = api.guard(request)
        req = await api.read_json(
            request, "api-admin-knowledge-build-request", KnowledgeBuildRequest
        )
        if not req.draftIds or len(set(req.draftIds)) != len(req.draftIds):
            raise ApiError(422, "invalid_request", "Choose one or more different drafts")
        drafts = [api.load(store, "drafts", draft_id) for draft_id in req.draftIds]
        everyone = api.records(store, "drafts")
        published = api.published(st)
        for draft in drafts:
            if draft["status"] != "content_approved":
                raise ApiError(
                    409, "knowledge_build_rejected", "Only content-approved drafts can be added"
                )
            if validate(draft, store, everyone, published)["blocking"]:
                raise ApiError(
                    409, "knowledge_build_rejected", "A selected draft has blocking issues"
                )
        try:
            version, report = await run_in_threadpool(build_version, st.knowledge, drafts)
        except FeedError as exc:
            raise ApiError(409, exc.code, exc.message) from exc
        with storage_errors():
            record = store.create("knowledge", {"id": new_id(), "status": "staged", **report})
        api.audit(
            store,
            "knowledge.built",
            "knowledge",
            record["id"],
            knowledgeVersion=version.knowledge_version,
            newChunks=report["newChunks"],
            checkPassed=report["checkPassed"],
        )
        return api.checked(st, "api-admin-knowledge-build", api.public(record))

    @app.post("/admin/dev/knowledge/activate")
    async def admin_knowledge_activate(request: Request) -> dict[str, Any]:
        st, store = api.guard(request)
        req = await api.read_json(
            request, "api-admin-knowledge-activate-request", KnowledgeActivateRequest
        )
        builds = api.records(store, "knowledge")
        known = {b["knowledgeVersion"] for b in builds} | {st.knowledge.base_version}
        if req.knowledgeVersion not in known:
            raise ApiError(404, "not_found", "Unknown knowledge version")
        try:
            await run_in_threadpool(activate, st.knowledge, req.knowledgeVersion)
        except (FeedError, KnowledgeUnavailable) as exc:
            raise ApiError(
                409, "knowledge_unavailable", "That version cannot be activated"
            ) from exc
        for build in builds:
            status = "active" if build["knowledgeVersion"] == req.knowledgeVersion else None
            if status is None and build["status"] == "active":
                status = "superseded"
            if status and status != build["status"]:
                with storage_errors():
                    store.update("knowledge", build["id"], build["version"], _with_status(status))
        api.audit(store, "knowledge.activated", "knowledge", None, version=req.knowledgeVersion)
        return api.checked(st, "api-admin-knowledge", knowledge_overview(st, store))

    @app.get("/admin/dev/knowledge/{knowledge_version}/chunks")
    def admin_knowledge_chunks(knowledge_version: str, request: Request) -> list[dict[str, Any]]:
        st, _store = api.guard(request)
        repo = st.knowledge.repository
        if repo is None or not re.fullmatch(r"[A-Za-z0-9._-]{1,80}", knowledge_version):
            raise ApiError(404, "not_found", "Not found")
        chunks = repo.chunks(knowledge_version)
        out = [
            {
                "chunkId": c.chunk_id,
                "documentTitle": c.document_title,
                "pdfPage": c.pdf_page,
                "heading": c.heading,
                "experimentId": c.experiment_id,
                "tokenCount": c.token_count,
                "text": c.text,
            }
            for c in chunks[:500]
        ]
        return api.checked(st, "api-admin-knowledge-chunks", out)

    # ------------------------------------------------------------------ practical library
    @app.get("/admin/dev/library")
    def admin_library(request: Request) -> dict[str, Any]:
        st, store = api.guard(request)
        strings = published_texts(st.settings.content_dir)
        counts: dict[str, int] = {}
        runtime = st.knowledge
        if runtime.repository is not None:
            try:
                active = runtime.repository.active()
                for chunk in runtime.repository.chunks(active.knowledge_version) if active else []:
                    key = chunk.experiment_id or ""
                    counts[key] = counts.get(key, 0) + 1
            except KnowledgeUnavailable:
                counts = {}
        si_status = _translation_status(st.settings.content_dir)
        entries: list[dict[str, Any]] = []
        for e in st.service.list_experiments():
            prefix = e["titleKey"].split(".", 1)[0]
            entries.append(
                {
                    "kind": "published",
                    "id": e["experimentId"],
                    "experimentNumber": e["experimentNumber"],
                    "title": strings.get(e["titleKey"], e["experimentId"]),
                    "status": "published",
                    "runnable": True,
                    "knowledgeChunks": counts.get(e["experimentId"], 0),
                    "sinhala": si_status.get(prefix, "draft"),
                    "blockers": [],
                }
            )
        drafts = api.records(store, "drafts")
        published = api.published(st)
        for d in drafts:
            if d["status"] == "archived":
                continue
            v = validate(d, store, drafts, published)
            entries.append(
                {
                    "kind": "draft",
                    "id": d["id"],
                    "experimentNumber": d["content"]["experimentNumber"],
                    "title": d["content"]["title"] or "",
                    "status": d["status"],
                    "runnable": False,
                    "knowledgeChunks": counts.get(draft_experiment_id(d["id"]), 0),
                    "sinhala": d["translation"]["si"],
                    "blockers": v["blocking"][:20] + ["simulation_definition_missing"],
                }
            )
        entries.sort(key=lambda x: (x["experimentNumber"] or 999, x["kind"]))
        body = {
            "entries": entries,
            "rule": "Only practicals with a validated simulation are runnable for students.",
        }
        return api.checked(st, "api-admin-library", body)

    # ------------------------------------------------------------------ users (no login)
    def check_user(req: UserRequest) -> None:
        name = req.displayName.strip()
        if not 2 <= len(name) <= 60 or CONTACT_DETAILS.search(name):
            raise ApiError(
                422,
                "invalid_request",
                "Use a pseudonymous display name (no e-mail addresses or phone numbers)",
            )
        if req.role not in ROLES or req.status not in USER_STATUSES or len(req.note) > 300:
            raise ApiError(422, "invalid_request", "Unknown role or status")

    def user_body(req: UserRequest) -> dict[str, Any]:
        return {
            "displayName": req.displayName.strip(),
            "role": req.role,
            "status": req.status,
            "note": req.note.strip(),
        }

    @app.get("/admin/dev/users")
    def admin_users(request: Request) -> dict[str, Any]:
        st, store = api.guard(request)
        body = {
            "users": [api.public(u) for u in api.records(store, "users")],
            "learnerData": st.store.owner_summary(),
            "rolesEnforced": False,
        }
        return api.checked(st, "api-admin-users", body)

    @app.post("/admin/dev/users", status_code=201)
    async def admin_user_create(request: Request) -> dict[str, Any]:
        st, store = api.guard(request)
        req = await api.read_json(request, "api-admin-user-request", UserRequest)
        check_user(req)
        with storage_errors():
            created = store.create("users", {"id": new_id(), **user_body(req)})
        api.audit(store, "user.created", "users", created["id"], role=req.role)
        return api.checked(st, "api-admin-user", api.public(created))

    @app.put("/admin/dev/users/{user_id}")
    async def admin_user_update(user_id: str, request: Request) -> dict[str, Any]:
        st, store = api.guard(request)
        req = await api.read_json(request, "api-admin-user-request", UserRequest)
        check_user(req)
        api.load(store, "users", user_id)
        if req.expectedVersion is None:
            raise ApiError(422, "invalid_request", "expectedVersion is required for updates")
        with storage_errors():
            updated = store.update(
                "users", user_id, req.expectedVersion, lambda r: {**r, **user_body(req)}
            )
        api.audit(store, "user.updated", "users", user_id, role=req.role, status=req.status)
        return api.checked(st, "api-admin-user", api.public(updated))

    # ------------------------------------------------------------------ source documents
    @app.get("/admin/dev/documents")
    def admin_documents(request: Request) -> list[dict[str, Any]]:
        st, store = api.guard(request)
        out = []
        for imp in api.records(store, "imports"):
            out.append(
                {
                    "importId": imp["id"],
                    "version": imp["version"],
                    "documentName": imp["documentName"],
                    "sourceSha256": imp["sourceSha256"],
                    "kind": imp["kind"],
                    "pageCount": imp["pageCount"],
                    "sizeBytes": imp["sizeBytes"],
                    "importedAt": imp["createdAt"],
                    "drafts": len(imp["draftIds"]),
                    "fileOk": store.upload_ok(imp["sourceSha256"]),
                    "licenceNote": imp.get("licenceNote", ""),
                }
            )
        return api.checked(st, "api-admin-documents", out)

    @app.put("/admin/dev/documents/{import_id}")
    async def admin_document_update(import_id: str, request: Request) -> dict[str, Any]:
        st, store = api.guard(request)
        req = await api.read_json(request, "api-admin-document-update-request", DocumentUpdate)
        if len(req.licenceNote) > 500:
            raise ApiError(422, "invalid_request", "The licence note is too long")
        api.load(store, "imports", import_id)
        with storage_errors():
            updated = store.update(
                "imports",
                import_id,
                req.expectedVersion,
                lambda r: {**r, "licenceNote": req.licenceNote.strip()},
            )
        api.audit(store, "document.licence_note", "imports", import_id)
        return api.checked(st, "api-admin-import", api.public(updated))

    # ------------------------------------------------------------------ translations
    @app.get("/admin/dev/translations")
    def admin_translations(request: Request) -> list[dict[str, Any]]:
        st, _store = api.guard(request)
        root = st.settings.content_dir / "locales"
        out = []
        for path in sorted((root / "en").glob("*.json")):
            en = json.loads(path.read_text(encoding="utf-8"))
            si_path = root / "si" / path.name
            si = json.loads(si_path.read_text(encoding="utf-8")) if si_path.is_file() else {}
            meta = si.get("_meta", {})
            keys = [k for k in en if k != "_meta"]
            out.append(
                {
                    "file": path.stem,
                    "keys": len(keys),
                    "translated": sum(1 for k in keys if isinstance(si.get(k), str) and si[k]),
                    "status": meta.get("translationStatus", "draft"),
                    "reviewer": meta.get("reviewer"),
                    "reviewedOn": meta.get("reviewedOn"),
                }
            )
        return api.checked(st, "api-admin-translations", out)

    @app.get("/admin/dev/translations/{file}.csv")
    def admin_translation_sheet(file: str, request: Request) -> Response:
        st, _store = api.guard(request)
        root = st.settings.content_dir / "locales"
        if not LOCALE_FILE.fullmatch(file) or not (root / "en" / f"{file}.json").is_file():
            raise ApiError(404, "not_found", "Not found")
        en = json.loads((root / "en" / f"{file}.json").read_text(encoding="utf-8"))
        si_path = root / "si" / f"{file}.json"
        si = json.loads(si_path.read_text(encoding="utf-8")) if si_path.is_file() else {}
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["key", "english", "sinhala_draft", "teacher_correction", "approved"])
        for key, value in en.items():
            if key != "_meta":
                writer.writerow([key, value, si.get(key, ""), "", ""])
        return Response(
            content="﻿" + buffer.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{file}-si-review.csv"'},
        )

    # ------------------------------------------------------------------ audit + settings
    @app.get("/admin/dev/audit")
    def admin_audit(request: Request) -> dict[str, Any]:
        st, store = api.guard(request)
        with storage_errors():
            events, chain_ok = store.audit(200)
        return api.checked(st, "api-admin-audit", {"events": events, "chainOk": chain_ok})

    @app.get("/admin/dev/settings")
    def admin_settings(request: Request) -> dict[str, Any]:
        st, _store = api.guard(request)
        s = st.settings
        body = {
            "environment": s.environment,
            "adminRepository": s.admin_repository,
            "knowledgeRepository": s.knowledge_repository,
            "databaseConfigured": bool(s.database_url and s.database_url.get_secret_value()),
            "embedding": {"provider": s.embedding_provider, "model": s.embedding_model},
            "generation": {
                "provider": s.llm_provider,
                "openaiModel": s.llm_model,
                "groqModel": s.groq_model,
                "ollamaModel": s.ollama_model,
                "openaiKeyConfigured": bool(
                    s.openai_api_key and s.openai_api_key.get_secret_value()
                ),
                "groqKeyConfigured": bool(s.groq_api_key and s.groq_api_key.get_secret_value()),
            },
            "ollamaBaseUrl": s.ollama_base_url,
            "extractionAssist": s.admin_extraction_assist,
            "loginEnabled": False,
        }
        return api.checked(st, "api-admin-settings", body)

    # ------------------------------------------------------------------ local AI suggestions
    @app.post("/admin/dev/drafts/{draft_id}/suggest")
    async def admin_suggest(draft_id: str, request: Request) -> dict[str, Any]:
        st, store = api.guard(request)
        req = await api.read_json(request, "api-admin-suggest-request", SuggestRequest)
        assistant = getattr(request.app.state, "extraction_assistant", None)
        if assistant is None:
            raise ApiError(
                409,
                "assist_unavailable",
                "Local AI suggestions are off (LAB_ADMIN_EXTRACTION_ASSIST).",
            )
        fields = [f for f in req.fields if f in LIST_FIELDS]
        if not fields or len(fields) != len(req.fields):
            raise ApiError(422, "invalid_request", "Choose list fields to suggest")
        draft = api.load(store, "drafts", draft_id)
        sha = draft["provenance"]["sourceSha256"]
        if not store.upload_ok(sha):
            raise ApiError(409, "assist_unavailable", "The source document is missing or changed")
        data = store.upload_path(sha).read_bytes()
        try:
            doc = await run_in_threadpool(
                extract_text,
                data,
                max_pages=st.settings.admin_max_pages,
                timeout_seconds=st.settings.admin_extract_timeout_seconds,
            )
        except DocumentRejected as exc:
            raise ApiError(exc.status, exc.code, exc.message) from exc
        first, last = draft["provenance"]["pageRange"]
        wanted = set(range(max(1, first), max(first, last) + 1))
        pages: dict[int, str] = {}
        for line in document_lines(doc.pages):
            if line.page in wanted:
                pages[line.page] = (pages.get(line.page, "") + "\n" + line.text).strip()
        try:
            raw = await run_in_threadpool(
                assistant.suggest, draft["content"]["title"] or "", fields, pages
            )
        except AssistUnavailable as exc:
            raise ApiError(503, "assist_failed", str(exc), retryable=True) from exc
        accepted, rejected = verify(raw, pages, fields)
        with storage_errors():
            updated = store.update(
                "drafts",
                draft_id,
                req.expectedVersion,
                lambda r: {**r, "suggestions": {**(r.get("suggestions") or {}), **accepted}},
            )
        api.audit(
            store,
            "draft.suggested",
            "drafts",
            draft_id,
            accepted=sum(len(v) for v in accepted.values()),
            rejected=rejected,
        )
        validation = validate(updated, store, api.records(store, "drafts"), api.published(st))
        body = {
            "accepted": sum(len(v) for v in accepted.values()),
            "rejected": rejected,
            "detail": {"draft": api.public(updated), "validation": validation},
        }
        return api.checked(st, "api-admin-suggest-result", body)


def _translation_status(content_dir: Any) -> dict[str, str]:
    out: dict[str, str] = {}
    for path in sorted((content_dir / "locales" / "si").glob("*.json")):
        meta = json.loads(path.read_text(encoding="utf-8")).get("_meta", {})
        out[path.stem] = meta.get("translationStatus", "draft")
    return out


def _with_status(status: str) -> Any:
    def change(record: dict[str, Any]) -> dict[str, Any]:
        return {**record, "status": status}

    return change
