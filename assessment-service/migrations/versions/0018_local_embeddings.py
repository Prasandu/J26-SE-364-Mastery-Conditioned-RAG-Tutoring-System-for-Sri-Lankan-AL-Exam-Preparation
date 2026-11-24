"""Switch resource-chunk embeddings from Gemini's API to a local model.

gemini-embedding-001 (768 dims) is replaced by BAAI/bge-m3, run locally via
sentence-transformers (app/ai/embeddings.py) - no API key, no daily quota, and
generally stronger retrieval. BGE-M3's own dense output is a fixed 1024 dimensions,
with no equivalent of Gemini's truncation to a smaller size.

A vector from one model is not comparable to one from another, so every existing
embedding is cleared (not just resized) - embed_pending_chunks finds them the same
way it finds a chunk that was never embedded at all (embedding IS NULL), and
re-embeds them the next time resource ingestion runs.

Revision ID: 0018
Revises: 0017
"""

from collections.abc import Sequence

from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_DIMENSIONS = 768
NEW_DIMENSIONS = 1024


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return  # SQLite (tests only) stores embeddings as plain JSON - no column type to change

    op.execute("DROP INDEX IF EXISTS ix_resource_chunks_embedding_cosine")
    # Clear first: a 768-dim vector is not valid data for a vector(1024) column, so
    # the type change below only works once every row is NULL.
    op.execute(
        "UPDATE resource_chunks SET embedding = NULL, embedding_model = NULL, embedded_at = NULL"
    )
    op.alter_column(
        "resource_chunks",
        "embedding",
        type_=Vector(NEW_DIMENSIONS),
        postgresql_using="NULL",
    )
    op.create_index(
        "ix_resource_chunks_embedding_cosine",
        "resource_chunks",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return

    op.execute("DROP INDEX IF EXISTS ix_resource_chunks_embedding_cosine")
    op.execute(
        "UPDATE resource_chunks SET embedding = NULL, embedding_model = NULL, embedded_at = NULL"
    )
    op.alter_column(
        "resource_chunks",
        "embedding",
        type_=Vector(OLD_DIMENSIONS),
        postgresql_using="NULL",
    )
    op.create_index(
        "ix_resource_chunks_embedding_cosine",
        "resource_chunks",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )
