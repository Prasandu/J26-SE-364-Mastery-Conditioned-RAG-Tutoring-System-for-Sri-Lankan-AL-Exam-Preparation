"""Trusted Chemistry resources (resource books, notes) that ground generated questions.

A resource is a PDF, split into chunks that each carry their own page number and an
embedding for similarity search. Re-ingesting the same file is a no-op; a changed file
becomes a new version, and the old one is kept so a citation already made still
resolves to the text it pointed at.

Nothing here is fed to the marking judge. These passages ground question generation
only - the approved marking points remain the only thing that awards a mark.
"""

from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.base import CASCADE_ALL, text_enum, utcnow

try:
    from pgvector.sqlalchemy import Vector
except ImportError:  # pragma: no cover - the package is a hard dependency; this guards import order
    Vector = None  # type: ignore[assignment]

# BAAI/bge-m3's own fixed dense-output size (app/ai/embeddings.py) - not a choice,
# unlike the Gemini embedding this replaced, which could be truncated to a smaller
# size. Changing embedding model is a breaking change for every stored chunk: a
# vector from one model is not comparable to one from another, so this is also a
# migration (see the one that changed this column from vector(768)).
EMBEDDING_DIMENSIONS = 1024

JSON_DOC = JSON().with_variant(JSONB(), "postgresql")
# Postgres stores a real vector(1024) with pgvector's own operators. SQLite (tests
# only) cannot: it gets a plain JSON array of floats, which is enough for the ORM
# tests that never run a similarity search - that only ever happens against Postgres.
#
# none_as_null=True matters: SQLAlchemy's plain JSON type otherwise stores a Python
# None as the JSON value "null", not a true SQL NULL, so "embedding IS NULL" (which
# embed_pending_chunks relies on to find unembedded chunks) would never match on
# SQLite without it. Postgres never sees this column at all - vector(1024) there, via
# the "postgresql" branch of the same with_variant, created in the migration.
EmbeddingColumn = Vector(EMBEDDING_DIMENSIONS).with_variant(JSON(none_as_null=True), "sqlite")


class ResourceStatus(StrEnum):
    """published is the only status retrieval reads from. draft and retired are not."""

    DRAFT = "draft"
    PUBLISHED = "published"
    RETIRED = "retired"


class ExtractionQuality(StrEnum):
    """What came out of one page of the PDF.

    Set once, at ingestion, from the raw character count and content of the page -
    never guessed at query time.
    """

    OK = "ok"
    EMPTY = "empty"  # no extractable text at all
    SCANNED = "scanned"  # almost certainly a scanned image with no text layer
    LOW_TEXT = "low_text"  # some text, but far less than a page this size should have


class Resource(Base):
    """One version of one Chemistry reference document.

    `code` is the stable identity a citation refers to; `version` changes when the
    underlying file changes. (code, version) is unique, so re-ingesting an unchanged
    file is recognised by `file_hash` and produces no new row at all.
    """

    __tablename__ = "resources"
    __table_args__ = (UniqueConstraint("code", "version"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(300))
    subject: Mapped[str] = mapped_column(String(50), default="chemistry")
    # A topic this resource is filed under, for filtering retrieval. Free text, not a
    # foreign key: a resource book usually covers more than one topic code cleanly.
    topic_code: Mapped[str | None] = mapped_column(String(30), index=True)
    status: Mapped[ResourceStatus] = mapped_column(text_enum(ResourceStatus), default=ResourceStatus.DRAFT)

    # The original PDF's own bytes, hashed. Re-ingesting the identical file is
    # recognised here and changes nothing - the point of "no uncontrolled duplicates".
    file_hash: Mapped[str] = mapped_column(String(64), index=True)
    # Key into the (access-controlled) file store; never served directly to a browser.
    file_key: Mapped[str] = mapped_column(String(300))
    page_count: Mapped[int] = mapped_column(Integer)
    # Per-page extraction quality, [{"page": 1, "quality": "ok", "chars": 1532}, ...].
    # Kept beside the resource so a thin or scanned page is visible without re-reading
    # the PDF.
    page_report: Mapped[list[dict[str, Any]]] = mapped_column(JSON_DOC, default=list)

    created_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    chunks: Mapped[list["ResourceChunk"]] = relationship(
        back_populates="resource", order_by="ResourceChunk.chunk_index", cascade=CASCADE_ALL
    )


class ResourceChunk(Base):
    """One retrievable passage: a page (or part of one), with its own embedding.

    Chunking never splits a paragraph - a worked example or an equation's explanation
    stays in one chunk, because it is one paragraph in the source PDF.
    """

    __tablename__ = "resource_chunks"
    __table_args__ = (
        UniqueConstraint("resource_id", "chunk_index"),
        # HNSW over IVFFlat: it builds without a training step, which matters while
        # this table is small. Cosine ops because embeddings are compared by
        # direction, not size - true regardless of which embedding model produced them.
        Index(
            "ix_resource_chunks_embedding_cosine",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    resource_id: Mapped[int] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer)
    page_number: Mapped[int | None] = mapped_column(Integer, index=True)
    # The nearest heading above this chunk on the page, if one was found. Null means
    # none was detected, not that the page has none.
    heading: Mapped[str | None] = mapped_column(String(300))
    text: Mapped[str] = mapped_column(Text)
    char_count: Mapped[int] = mapped_column(Integer)
    extraction_quality: Mapped[ExtractionQuality] = mapped_column(
        text_enum(ExtractionQuality), default=ExtractionQuality.OK
    )
    # sha256 of `text`. Lets a reprocess skip re-embedding a chunk whose wording did
    # not actually change between versions - the embedding call is the expensive part.
    content_hash: Mapped[str] = mapped_column(String(64), index=True)

    embedding: Mapped[list[float] | None] = mapped_column(EmbeddingColumn)
    embedding_model: Mapped[str | None] = mapped_column(String(100))
    embedded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    resource: Mapped[Resource] = relationship(back_populates="chunks")
