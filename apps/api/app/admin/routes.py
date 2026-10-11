"""Development-only admin endpoints (``/admin/dev/...``). Every handler runs the loopback guard
first; when admin mode is off or the request is not a verified local request, the response is
404. There is deliberately no publish, catalog-replacement or rollback endpoint here."""

import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import FastAPI, Request
from pydantic import BaseModel, ConfigDict
from starlette.concurrency import run_in_threadpool

from app.admin.access import require_content_type, require_dev_admin
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
from app.admin.store import (
    AdminStore,
    IntegrityError,
    StorageUnavailable,
    StoreError,
    VersionConflict,
    new_id,
)
from app.errors import ApiError

logger = logging.getLogger("vlab.admin")
PDF = "application/pdf"


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


def register_admin_routes(
    app: FastAPI,
    state: Callable[[Request], Any],
    read_json: Callable[[Request, str, type[Any]], Awaitable[Any]],
) -> None:
    def guard(request: Request) -> tuple[Any, AdminStore]:
        st = state(request)
        require_dev_admin(request, st.settings)
        return st, AdminStore(st.settings.admin_data_dir)

    def published(st: Any) -> list[tuple[str, int, str | None]]:
        titles = _english_titles(st.settings.content_dir)
        return [
            (e["experimentId"], e["experimentNumber"], titles.get(e["titleKey"]))
            for e in st.service.list_experiments()
        ]

    def checked(st: Any, schema: str, body: dict[str, Any]) -> dict[str, Any]:
        if not st.contracts.is_valid(schema, body):
            logger.error("admin response failed its contract: %s", schema)
            raise ApiError(500, "internal_error", "Unexpected server error")
        return body

    def load(store: AdminStore, kind: str, record_id: str) -> dict[str, Any]:
        try:
            record = store.get(kind, record_id)
        except IntegrityError as exc:
            raise ApiError(500, "admin_storage_error", "A stored record failed its check") from exc
        except StorageUnavailable as exc:
            raise _storage_error(exc) from exc
        except StoreError as exc:
            raise ApiError(404, "not_found", "Not found") from exc
        if record is None:
            raise ApiError(404, "not_found", "Not found")
        return record

    def all_drafts(store: AdminStore) -> list[dict[str, Any]]:
        try:
            return store.list("drafts")
        except IntegrityError as exc:
            raise ApiError(500, "admin_storage_error", "A stored record failed its check") from exc
        except StorageUnavailable as exc:
            raise _storage_error(exc) from exc

    def detail(st: Any, store: AdminStore, draft: dict[str, Any]) -> dict[str, Any]:
        validation = validate(draft, store, all_drafts(store), published(st))
        public = {k: v for k, v in draft.items() if k != "integrity"}  # internal checksum
        return checked(st, "api-admin-draft-detail", {"draft": public, "validation": validation})

    @app.get("/admin/dev/status")
    def admin_status(request: Request) -> dict[str, Any]:
        st, store = guard(request)
        drafts = all_drafts(store)
        pub = published(st)
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
                "imports": len(store.list("imports")),
            },
            "operations": ["import_guide", "import_single", "edit", "validate", "review"],
        }
        return checked(st, "api-admin-status", body)

    @app.get("/admin/dev/drafts")
    def admin_drafts(request: Request) -> list[dict[str, Any]]:
        st, store = guard(request)
        drafts = all_drafts(store)
        pub = published(st)
        out = [summary(d, validate(d, store, drafts, pub)) for d in drafts]
        for item in out:
            checked(st, "api-admin-draft-summary", item)
        return out

    @app.get("/admin/dev/drafts/{draft_id}")
    def admin_draft(draft_id: str, request: Request) -> dict[str, Any]:
        st, store = guard(request)
        return detail(st, store, load(store, "drafts", draft_id))

    @app.get("/admin/dev/imports")
    def admin_imports(request: Request) -> list[dict[str, Any]]:
        st, store = guard(request)
        imports = [{k: v for k, v in i.items() if k != "integrity"} for i in store.list("imports")]
        for item in imports:
            checked(st, "api-admin-import", item)
        return imports

    @app.post("/admin/dev/imports", status_code=201)
    async def admin_import(request: Request, kind: str, filename: str = "") -> dict[str, Any]:
        st, store = guard(request)
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
        try:
            return await run_in_threadpool(
                _store_import, st, store, kind, name, data, doc, candidates
            )
        except StorageUnavailable as exc:
            raise _storage_error(exc) from exc

    def _store_import(
        st: Any,
        store: AdminStore,
        kind: str,
        name: str,
        data: bytes,
        doc: Any,
        candidates: list[Any],
    ) -> dict[str, Any]:
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
            },
        )
        created = [
            store.create("drafts", {**r, "id": i}) for r, i in zip(records, ids, strict=True)
        ]
        drafts = all_drafts(store)
        pub = published(st)
        body = {
            "import": {k: v for k, v in imported.items() if k != "integrity"},
            "drafts": [summary(d, validate(d, store, drafts, pub)) for d in created],
        }
        logger.info("admin import kind=%s drafts=%d pages=%d", kind, len(created), doc.page_count)
        return checked(st, "api-admin-import-result", body)

    @app.put("/admin/dev/drafts/{draft_id}")
    async def admin_edit(draft_id: str, request: Request) -> dict[str, Any]:
        st, store = guard(request)
        req = await read_json(request, "api-admin-draft-update-request", DraftUpdate)
        current = load(store, "drafts", draft_id)
        imported = load(store, "imports", current["importId"])
        pages = _checked_pages(req.sourcePages, imported["pageCount"])
        try:
            updated = store.update(
                "drafts",
                draft_id,
                req.expectedVersion,
                lambda r: apply_edit(r, dict(req.content), pages),
            )
        except VersionConflict as conflict:
            raise _conflict(conflict) from conflict
        except StorageUnavailable as exc:
            raise _storage_error(exc) from exc
        except TransitionError as exc:
            raise ApiError(409, "review_transition_invalid", str(exc)) from exc
        return detail(st, store, updated)

    @app.post("/admin/dev/drafts/{draft_id}/validate")
    def admin_validate(draft_id: str, request: Request) -> dict[str, Any]:
        st, store = guard(request)
        return detail(st, store, load(store, "drafts", draft_id))

    @app.post("/admin/dev/drafts/{draft_id}/review")
    async def admin_review(draft_id: str, request: Request) -> dict[str, Any]:
        st, store = guard(request)
        req = await read_json(request, "api-admin-review-request", ReviewRequest)
        current = load(store, "drafts", draft_id)
        validation = validate(current, store, all_drafts(store), published(st))
        try:
            updated = store.update(
                "drafts",
                draft_id,
                req.expectedVersion,
                lambda r: apply_review(r, req.action, req.field, req.reviewed, validation),
            )
        except VersionConflict as conflict:
            raise _conflict(conflict) from conflict
        except StorageUnavailable as exc:
            raise _storage_error(exc) from exc
        except TransitionError as exc:
            raise ApiError(409, "review_transition_invalid", str(exc)) from exc
        logger.info("admin review action=%s status=%s", req.action, updated["status"])
        return detail(st, store, updated)


def _storage_error(exc: StorageUnavailable) -> ApiError:
    logger.error("admin storage unavailable: %s", type(exc.__cause__).__name__)
    return ApiError(500, "admin_storage_error", "Admin storage is not available")


def _conflict(conflict: VersionConflict) -> ApiError:
    return ApiError(
        409,
        "draft_version_conflict",
        "The draft changed since it was loaded; reload it and try again",
        details={"currentVersion": conflict.current},
    )


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


def _english_titles(content_dir: Any) -> dict[str, str]:
    titles: dict[str, str] = {}
    for path in sorted((content_dir / "locales" / "en").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        titles.update(
            {k: v for k, v in data.items() if k.endswith(".title") and isinstance(v, str)}
        )
    return titles
