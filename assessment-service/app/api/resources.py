"""Admin endpoints: ingest, embed, publish and search trusted Chemistry resources.

Every route needs a signed-in admin account (see app/security.py). A resource's original
PDF and its extracted text are never exposed by any other route - search here is the
only way to read a chunk's text back, and it is behind the same key.
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import build_embedding_model
from app.ai.embeddings import EmbeddingModel
from app.config import Settings, get_settings
from app.db import get_db
from app.models import Resource, User
from app.schemas.resources import (
    EmbedResultOut,
    IngestResultOut,
    PageReportOut,
    PassageOut,
    PublishResultOut,
    ResourceSummaryOut,
    SearchResultOut,
)
from app.security import require_admin
from app.services.resources.ingest import (
    embed_and_publish,
    embed_pending_chunks,
    ingest_resource,
    publish_resource,
)
from app.services.resources.retrieve import DEFAULT_LIMIT
from app.services.resources.retrieve import search as search_resources
from app.services.storage import FileStore, LocalFileStore

router = APIRouter(prefix="/admin/resources", tags=["resources"], dependencies=[Depends(require_admin)])

NO_EMBEDDER = "The local embedding model could not be loaded."


def get_embedder(settings: Settings = Depends(get_settings)) -> EmbeddingModel | None:
    return build_embedding_model(settings)


def get_resource_store(settings: Settings = Depends(get_settings)) -> FileStore:
    """Where original resource PDFs live. Never served by any route - only read
    back through FileStore.load, by the ingestion pipeline itself."""
    return LocalFileStore(settings.resources_dir)


@router.get("", response_model=list[ResourceSummaryOut])
def list_resources(db: Session = Depends(get_db)):
    return db.scalars(select(Resource).order_by(Resource.code, Resource.version)).all()


@router.post("", response_model=IngestResultOut, status_code=status.HTTP_201_CREATED)
async def upload_resource(
    code: str = Form(pattern=r"^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$"),
    title: str = Form(min_length=1, max_length=300),
    subject: str = Form(default="chemistry", max_length=50),
    topic_code: str | None = Form(default=None, max_length=30),
    file: UploadFile = File(description="The resource PDF"),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    store: FileStore = Depends(get_resource_store),
    user: User = Depends(require_admin),
):
    """Ingest a resource PDF as a new version, or do nothing if it is unchanged.

    The chunks are not embedded here - that is its own step (POST .../embed), so a
    large upload is never blocked on a slow or quota-limited provider call.

    created_by always comes from the signed-in account, never the request body -
    same reason app/api/attempts.py does this for student_ref.
    """
    pdf = await _read_upload(file, settings.max_resource_upload_mb)
    result = ingest_resource(
        db,
        store,
        code=code,
        title=title,
        topic_code=topic_code,
        subject=subject,
        pdf=pdf,
        created_by=user.email,
    )
    return IngestResultOut(
        resource=result.resource,
        created=result.created,
        chunks_created=result.chunks_created,
        chunks_reused=result.chunks_reused,
        thin_pages=[PageReportOut(**row) for row in result.thin_pages],
    )


@router.post("/{code}/{version}/embed", response_model=EmbedResultOut)
def embed_resource(
    code: str,
    version: int,
    db: Session = Depends(get_db),
    embedder: EmbeddingModel | None = Depends(get_embedder),
):
    """Embed every chunk of this resource version that does not have an embedding yet."""
    resource = _get_version(db, code, version)
    if embedder is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NO_EMBEDDER)
    embedded, failures = embed_pending_chunks(db, embedder, resource_id=resource.id)
    still_pending = sum(1 for chunk in resource.chunks if chunk.embedding is None)
    return EmbedResultOut(embedded=embedded, still_pending=still_pending, failures=failures)


@router.post("/{code}/{version}/publish", response_model=ResourceSummaryOut)
def publish(code: str, version: int, db: Session = Depends(get_db)):
    """Make this version retrievable, retiring whichever version was published before."""
    return publish_resource(db, code, version)


@router.post("/{code}/{version}/embed-and-publish", response_model=PublishResultOut)
def publish_with_embedding(
    code: str,
    version: int,
    db: Session = Depends(get_db),
    embedder: EmbeddingModel | None = Depends(get_embedder),
):
    """Embed whatever this version still needs, then publish it - one admin action.

    Refuses to publish if any chunk could not be embedded, rather than quietly
    going live with gaps (see app.services.resources.ingest.embed_and_publish).
    """
    if embedder is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NO_EMBEDDER)
    resource, embedded, failures = embed_and_publish(db, embedder, code, version)
    return PublishResultOut(resource=resource, embedded=embedded, failures=failures)


@router.get("/search", response_model=SearchResultOut)
def search(
    query: str = Query(min_length=1, max_length=500),
    topic_code: str | None = None,
    resource_code: str | None = None,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=20),
    min_similarity: float = Query(default=0.0, ge=0, le=1),
    db: Session = Depends(get_db),
    embedder: EmbeddingModel | None = Depends(get_embedder),
):
    """Search published resource passages directly.

    For an admin checking what retrieval would surface, and for a teacher reviewing
    an answer who wants related reference text beside it (see docs/rag-resources.md -
    this never feeds the marking judge; the approved marking points stay the only
    thing that awards a mark).
    """
    if embedder is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NO_EMBEDDER)
    result = search_resources(
        db,
        embedder,
        query,
        topic_code=topic_code,
        resource_code=resource_code,
        limit=limit,
        min_similarity=min_similarity,
    )
    return SearchResultOut(
        passages=[PassageOut(**vars(p)) for p in result.passages],
        query_embedded=result.query_embedded,
        elapsed_seconds=result.elapsed_seconds,
    )


def _get_version(db: Session, code: str, version: int) -> Resource:
    resource = db.scalars(select(Resource).where(Resource.code == code, Resource.version == version)).first()
    if resource is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No resource {code} v{version}")
    return resource


async def _read_upload(file: UploadFile, max_mb: float) -> bytes:
    limit = int(max_mb * 1024 * 1024)
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"The PDF must be under {max_mb} MB")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty")
    return data
