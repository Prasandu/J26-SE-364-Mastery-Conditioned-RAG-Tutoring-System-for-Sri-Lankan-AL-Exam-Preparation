"""Development-only admin endpoints for imports and practical drafts (``/admin/dev/...``).

Every handler runs the loopback guard first; when admin mode is off or the request is not a
verified local request, the response is 404. Every change is written to the append-only audit
log. Content approval never makes a practical runnable and never changes the student catalog."""

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import FastAPI, Request
from pydantic import BaseModel, ConfigDict
from starlette.concurrency import run_in_threadpool

from app.admin.access import require_content_type
from app.admin.common import AdminApi, storage_errors
from app.admin.drafts import (
    LIST_FIELDS,
    TransitionError,
    apply_edit,
    apply_review,
    draft_from_candidate,
    summary,
    validate,
)
from app.admin.extract import extract_practicals, extract_single
from app.admin.ingest import (
    EXTRACTOR_VERSION,
    DocumentRejected,
    check_signature,
    extract_text,
    safe_display_name,
)
from app.admin.store import AdminRepository, new_id
from app.errors import ApiError

logger = logging.getLogger("vlab.admin")
PDF = "application/pdf"
OPERATIONS = [
    "import_guide",
    "import_single",
    "edit",
    "validate",
    "review",
    "knowledge_build",
    "users",
    "audit",
    "assist",
]


class DraftUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    expectedVersion: int
    content: dict[str, Any]
    sourcePages: dict[str, list[int]]


class ReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    expectedVersion: int
    action: str
    field: str | None
    reviewed: bool | None
    otherId: str | None = None


def register_admin_routes(
    app: FastAPI,
    state: Callable[[Request], Any],
    read_json: Callable[[Request, str, type[Any]], Awaitable[Any]],
) -> AdminApi:
    api = AdminApi(state, read_json)

    def detail(st: Any, store: AdminRepository, draft: dict[str, Any]) -> dict[str, Any]:
        validation = validate(draft, store, api.records(store, "drafts"), api.published(st))
        body = {"draft": api.public(draft), "validation": validation}
        return api.checked(st, "api-admin-draft-detail", body)

    @app.get("/admin/dev/status")
    def admin_status(request: Request) -> dict[str, Any]:
        st, store = api.guard(request)
        drafts = api.records(store, "drafts")
        pub = api.published(st)
        active = [d for d in drafts if d["status"] != "archived"]
        failures = sum(1 for d in active if validate(d, store, drafts, pub)["blocking"])
        body = {
            "mode": "development",
            "limits": {
                "maxUploadBytes": st.settings.admin_max_upload_bytes,
                "maxPages": st.settings.admin_max_pages,
            },
            "counts": {
                "drafts": len(active),
                "needsReview": sum(1 for d in active if d["status"] == "needs_review"),
                "contentApproved": sum(1 for d in active if d["status"] == "content_approved"),
                "validationFailures": failures,
                "imports": len(api.records(store, "imports")),
            },
            "operations": OPERATIONS,
        }
        return api.checked(st, "api-admin-status", body)

    @app.get("/admin/dev/drafts")
    def admin_drafts(request: Request) -> list[dict[str, Any]]:
        st, store = api.guard(request)
        drafts = api.records(store, "drafts")
        pub = api.published(st)
        out = [summary(d, validate(d, store, drafts, pub)) for d in drafts]
        for item in out:
            api.checked(st, "api-admin-draft-summary", item)
        return out

    @app.get("/admin/dev/drafts/{draft_id}")
    def admin_draft(draft_id: str, request: Request) -> dict[str, Any]:
        st, store = api.guard(request)
        return detail(st, store, api.load(store, "drafts", draft_id))

    @app.get("/admin/dev/imports")
    def admin_imports(request: Request) -> list[dict[str, Any]]:
        st, store = api.guard(request)
        imports = [api.public(i) for i in api.records(store, "imports")]
        for item in imports:
            api.checked(st, "api-admin-import", item)
        return imports

    @app.post("/admin/dev/imports", status_code=201)
    async def admin_import(request: Request, kind: str, filename: str = "") -> dict[str, Any]:
        st, store = api.guard(request)
        require_content_type(request, PDF)
        if kind not in ("guide", "single"):
            raise ApiError(422, "invalid_request", "kind must be 'guide' or 'single'")
        settings = st.settings
        data = await _read_limited(request, settings.admin_max_upload_bytes)
        try:
            check_signature(data)
            doc = await run_in_threadpool(
                extract_text,
                data,
                max_pages=settings.admin_max_pages,
                timeout_seconds=settings.admin_extract_timeout_seconds,
            )
            try:
                candidates = (
                    extract_practicals(doc.pages) if kind == "guide" else extract_single(doc.pages)
                )
            except ValueError as exc:
                raise DocumentRejected(
                    422,
                    "multiple_practicals",
                    "This document contains several practicals; import it as a full guide.",
                ) from exc
            if not candidates:
                raise DocumentRejected(
                    422, "document_invalid", "No 'Experiment N' practical headings were found."
                )
        except DocumentRejected as rejected:
            logger.info("admin import rejected code=%s", rejected.code)
            raise ApiError(rejected.status, rejected.code, rejected.message) from rejected
        name = safe_display_name(filename)
        with storage_errors():
            return await run_in_threadpool(
                _store_import, st, store, kind, name, data, doc, candidates
            )

    def _store_import(
        st: Any,
        store: AdminRepository,
        kind: str,
        name: str,
        data: bytes,
        doc: Any,
        candidates: list[Any],
    ) -> dict[str, Any]:
        import hashlib

        sha = hashlib.sha256(data).hexdigest()
        # File-level duplicate guard: the same document is imported once.
        existing = next((i for i in store.list("imports") if i["sourceSha256"] == sha), None)
        if existing is not None:
            raise ApiError(
                409,
                "document_already_imported",
                "This exact document was already imported.",
                details={"importId": existing["id"]},
            )
        sha = store.save_upload(data)
        import_id = new_id()
        records = [
            draft_from_candidate(
                c,
                import_id=import_id,
                sha256=sha,
                document_name=name,
                kind=kind,
                extractor=EXTRACTOR_VERSION,
            )
            for c in candidates
        ]
        ids = [new_id() for _ in records]
        imported = store.create(
            "imports",
            {
                "id": import_id,
                "kind": kind,
                "documentName": name,
                "sourceSha256": sha,
                "sizeBytes": len(data),
                "pageCount": doc.page_count,
                "extractorVersion": EXTRACTOR_VERSION,
                "draftIds": ids,
                "licenceNote": "",
            },
        )
        created = [
            store.create("drafts", {**r, "id": i}) for r, i in zip(records, ids, strict=True)
        ]
        api.audit(
            store,
            "import.created",
            "imports",
            import_id,
            kind=kind,
            documentName=name,
            pages=doc.page_count,
            drafts=len(created),
        )
        drafts = store.list("drafts")
        pub = api.published(st)
        body = {
            "import": api.public(imported),
            "drafts": [summary(d, validate(d, store, drafts, pub)) for d in created],
        }
        logger.info("admin import kind=%s drafts=%d pages=%d", kind, len(created), doc.page_count)
        return api.checked(st, "api-admin-import-result", body)

    @app.put("/admin/dev/drafts/{draft_id}")
    async def admin_edit(draft_id: str, request: Request) -> dict[str, Any]:
        st, store = api.guard(request)
        req = await read_json(request, "api-admin-draft-update-request", DraftUpdate)
        current = api.load(store, "drafts", draft_id)
        imported = api.load(store, "imports", current["importId"])
        pages = _checked_pages(req.sourcePages, imported["pageCount"])
        try:
            with storage_errors():
                updated = store.update(
                    "drafts",
                    draft_id,
                    req.expectedVersion,
                    lambda r: apply_edit(r, dict(req.content), pages),
                )
        except TransitionError as exc:
            raise ApiError(409, "review_transition_invalid", str(exc)) from exc
        changed = [f for f, v in updated["fieldEdited"].items() if v != current["fieldEdited"][f]]
        api.audit(store, "draft.edited", "drafts", draft_id, version=updated["version"])
        logger.info("admin edit draft=%s newly_edited=%d", draft_id, len(changed))
        return detail(st, store, updated)

    @app.post("/admin/dev/drafts/{draft_id}/validate")
    def admin_validate(draft_id: str, request: Request) -> dict[str, Any]:
        st, store = api.guard(request)
        return detail(st, store, api.load(store, "drafts", draft_id))

    @app.post("/admin/dev/drafts/{draft_id}/review")
    async def admin_review(draft_id: str, request: Request) -> dict[str, Any]:
        st, store = api.guard(request)
        req = await read_json(request, "api-admin-review-request", ReviewRequest)
        current = api.load(store, "drafts", draft_id)
        validation = validate(current, store, api.records(store, "drafts"), api.published(st))
        try:
            with storage_errors():
                updated = store.update(
                    "drafts",
                    draft_id,
                    req.expectedVersion,
                    lambda r: apply_review(
                        r, req.action, req.field, req.reviewed, validation, req.otherId
                    ),
                )
        except TransitionError as exc:
            raise ApiError(409, "review_transition_invalid", str(exc)) from exc
        api.audit(
            store,
            f"draft.{req.action}",
            "drafts",
            draft_id,
            field=req.field,
            otherId=req.otherId,
            status=updated["status"],
        )
        logger.info("admin review action=%s status=%s", req.action, updated["status"])
        return detail(st, store, updated)

    return api


def _checked_pages(pages: dict[str, list[int]], page_count: int) -> dict[str, list[int]]:
    for name, values in pages.items():
        if name not in LIST_FIELDS:
            raise ApiError(422, "invalid_request", f"Unknown field for source pages: {name}")
        if any(p < 1 or p > page_count for p in values):
            raise ApiError(422, "invalid_request", "Source pages must exist in the source document")
    return {name: sorted(set(values)) for name, values in pages.items() if values}


async def _read_limited(request: Request, limit: int) -> bytes:
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise ApiError(413, "request_too_large", f"The PDF is larger than {limit // 1048576} MB")
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise ApiError(
                413, "request_too_large", f"The PDF is larger than {limit // 1048576} MB"
            )
        chunks.append(chunk)
    if not size:
        raise ApiError(422, "document_invalid", "The upload is empty.")
    return b"".join(chunks)
