"""Saving a resource and its chunks, versioned, without uncontrolled duplicates.

Two different things are both called "a duplicate" here, and they are handled
differently:

- the same file ingested twice (same bytes): a no-op. `file_hash` catches this before
  anything is extracted, chunked or embedded.
- a changed file under the same code: a new version. Chunks whose text did not
  change keep their existing embedding rather than being re-embedded - the embedding
  call is the one that costs money and can hit a quota, so it only runs on what is
  actually new.

The PDF itself and its extracted text are access-controlled: the file is kept under
`FileStore`, never served by any route, and a chunk's text is only ever read back
through this service's own functions, behind the admin key (see app/api/resources.py).
"""

import hashlib
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.embeddings import EmbeddingModel
from app.errors import ContentValidationError
from app.models import (
    EMBEDDING_DIMENSIONS,
    ExtractionQuality,
    Resource,
    ResourceChunk,
    ResourceStatus,
    utcnow,
)
from app.services.resources.chunk import ChunkDraft, chunk_pages
from app.services.resources.extract import extract_pages, page_report
from app.services.storage import PDF_CONTENT_TYPE, FileStore


@dataclass
class IngestResult:
    resource: Resource | None  # None when the file was unchanged and nothing was done
    created: bool  # a new version was made
    chunks_created: int = 0
    chunks_reused: int = 0  # unchanged text, embedding carried over from the last version
    thin_pages: list[dict] = field(default_factory=list)


def ingest_resource(
    db: Session,
    store: FileStore,
    *,
    code: str,
    title: str,
    topic_code: str | None,
    subject: str,
    pdf: bytes,
    created_by: str,
) -> IngestResult:
    """Extract, chunk and save one resource PDF as a new version, or do nothing.

    `pdf` is kept in memory only long enough to be hashed, written to the file store,
    and read back by pypdfium2, which needs a path. The caller supplies the bytes
    (e.g. an upload), not a path on a shared drive, so this never reads a file the
    admin key alone would not have been allowed to read.
    """
    file_hash = hashlib.sha256(pdf).hexdigest()
    latest = _latest_version(db, code)
    if latest is not None and latest.file_hash == file_hash:
        return IngestResult(resource=None, created=False)

    key = store.save(pdf, PDF_CONTENT_TYPE)
    try:
        # The saved copy is the permanent, access-controlled one. Reading it back for
        # extraction uses its own throwaway temp file, so this never depends on the
        # store being path-based (a future Supabase Storage one would not be).
        pages = _extract_from_bytes(pdf)
    except Exception:
        store.delete(key)
        raise

    if not any(page.text for page in pages):
        store.delete(key)
        raise ContentValidationError(
            "This PDF has no extractable text on any page",
            ["It may be entirely scanned images. A vision-based path would be needed, not this one."],
        )

    drafts = chunk_pages(pages)
    if not drafts:
        store.delete(key)
        raise ContentValidationError("No chunkable text was found", ["Every page was empty after chunking"])

    resource = Resource(
        code=code,
        version=(latest.version + 1) if latest else 1,
        title=title,
        subject=subject,
        topic_code=topic_code,
        status=ResourceStatus.DRAFT,
        file_hash=file_hash,
        file_key=key,
        page_count=len(pages),
        page_report=page_report(pages),
        created_by=created_by,
        created_at=utcnow(),
    )
    db.add(resource)
    db.flush()  # resource.id, for the chunks' foreign key

    previous_by_hash = _previous_chunks_by_hash(latest) if latest else {}
    created, reused = _save_chunks(db, resource, drafts, previous_by_hash)

    db.commit()
    thin = [p for p in resource.page_report if p["quality"] != ExtractionQuality.OK.value]
    return IngestResult(resource, created=True, chunks_created=created, chunks_reused=reused, thin_pages=thin)


def embed_pending_chunks(
    db: Session, embedder: EmbeddingModel, *, resource_id: int | None = None, limit: int = 200
) -> tuple[int, list[str]]:
    """Embed every chunk that does not have one yet.

    Returns (embedded, failures). A failure leaves the chunk's embedding null, so it
    is picked up again next time this runs rather than silently staying unembedded
    forever or half-written.
    """
    stmt = select(ResourceChunk).where(ResourceChunk.embedding.is_(None)).limit(limit)
    if resource_id is not None:
        stmt = stmt.where(ResourceChunk.resource_id == resource_id)
    pending = db.scalars(stmt).all()
    if not pending:
        return 0, []

    result = embedder.embed([chunk.text for chunk in pending])
    embedded = 0
    for chunk, vector in zip(pending, result.vectors, strict=True):
        if vector is None:
            continue
        if len(vector) != EMBEDDING_DIMENSIONS:
            result.failures.append(
                f"chunk {chunk.id}: got {len(vector)} dimensions, not {EMBEDDING_DIMENSIONS}"
            )
            continue
        chunk.embedding = vector
        chunk.embedding_model = result.model
        chunk.embedded_at = utcnow()
        embedded += 1
    db.commit()
    return embedded, result.failures


MOST_EMBED_ROUNDS = 20  # 20 * the 200-chunk batch = 4000 chunks; a safety cap, not a real ceiling


def embed_and_publish(
    db: Session, embedder: EmbeddingModel, code: str, version: int
) -> tuple[Resource, int, list[str]]:
    """Embed every chunk this version still needs, then publish it - one admin
    action instead of two, and it is no longer possible to publish a version that
    is not actually searchable yet (see embed_pending_chunks for why a failure
    leaves a chunk pending rather than half-written).

    Returns (resource, embedded, failures). If any chunk could not be embedded,
    nothing is published - a half-embedded version going live silently, with no
    error and nothing to show it happened, is worse than refusing and saying why.
    """
    resource = db.scalars(select(Resource).where(Resource.code == code, Resource.version == version)).first()
    if resource is None:
        raise ContentValidationError("No such resource version", [f"{code} v{version} does not exist"])

    total_embedded = 0
    failures: list[str] = []
    for _ in range(MOST_EMBED_ROUNDS):
        embedded, round_failures = embed_pending_chunks(db, embedder, resource_id=resource.id)
        total_embedded += embedded
        failures += round_failures
        if embedded == 0:
            break  # nothing left, or nothing more this embedder can do right now

    still_pending = sum(1 for chunk in resource.chunks if chunk.embedding is None)
    if still_pending:
        raise ContentValidationError(
            f"{still_pending} chunk(s) could not be embedded, so this version was not published",
            failures or [f"{still_pending} chunk(s) have no embedding"],
        )

    return publish_resource(db, code, version), total_embedded, failures


def publish_resource(db: Session, code: str, version: int) -> Resource:
    """Make one version of a resource retrievable, and retire any earlier version.

    Only one version of a resource is ever retrievable at once: retrieval must not
    return the same passage twice from two versions, and a reader should only ever
    be pointed at the current text.
    """
    resource = db.scalars(select(Resource).where(Resource.code == code, Resource.version == version)).first()
    if resource is None:
        raise ContentValidationError("No such resource version", [f"{code} v{version} does not exist"])

    for other in db.scalars(
        select(Resource).where(Resource.code == code, Resource.status == ResourceStatus.PUBLISHED)
    ):
        other.status = ResourceStatus.RETIRED
    resource.status = ResourceStatus.PUBLISHED
    db.commit()
    return resource


def _latest_version(db: Session, code: str) -> Resource | None:
    return db.scalars(select(Resource).where(Resource.code == code).order_by(Resource.version.desc())).first()


def _previous_chunks_by_hash(resource: Resource) -> dict[str, ResourceChunk]:
    return {chunk.content_hash: chunk for chunk in resource.chunks if chunk.embedding is not None}


def _save_chunks(
    db: Session, resource: Resource, drafts: list[ChunkDraft], previous_by_hash: dict[str, ResourceChunk]
) -> tuple[int, int]:
    created = reused = 0
    for index, draft in enumerate(drafts):
        content_hash = hashlib.sha256(draft.text.encode("utf-8")).hexdigest()
        earlier = previous_by_hash.get(content_hash)
        chunk = ResourceChunk(
            resource_id=resource.id,
            chunk_index=index,
            page_number=draft.page_number,
            heading=draft.heading,
            text=draft.text,
            char_count=len(draft.text),
            content_hash=content_hash,
            extraction_quality=_page_quality(resource, draft.page_number),
        )
        if earlier is not None:
            chunk.embedding = earlier.embedding
            chunk.embedding_model = earlier.embedding_model
            chunk.embedded_at = earlier.embedded_at
            reused += 1
        else:
            created += 1
        db.add(chunk)
    return created, reused


def _page_quality(resource: Resource, page_number: int) -> ExtractionQuality:
    for row in resource.page_report:
        if row["page"] == page_number:
            return ExtractionQuality(row["quality"])
    return ExtractionQuality.OK


def _extract_from_bytes(pdf: bytes) -> list:
    """pypdfium2 needs a real path, so the bytes are written to a throwaway temp
    file - the saved copy under FileStore is the permanent, access-controlled one.

    Closed before pdfium opens it (not held open with the file object): Windows
    locks an open file against a second reader, and pdfium opens by path itself.
    """
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as handle:
        handle.write(pdf)
        path = Path(handle.name)
    try:
        return extract_pages(path)
    finally:
        path.unlink(missing_ok=True)
