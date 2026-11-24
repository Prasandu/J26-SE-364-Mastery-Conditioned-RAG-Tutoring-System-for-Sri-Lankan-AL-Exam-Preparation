"""Trusted Chemistry resources, chunked and embedded, for grounding generated questions.

Adds the pgvector extension (0.8.2, already available on this Supabase project - see
docs/rag-resources.md for the check), the resources/resource_chunks tables, and
papers.grounded_in, the system's own record of which passages it retrieved while
writing a paper.

The embedding column is vector(768): gemini-embedding-001 run with
output_dimensionality=768, measured directly rather than assumed (see the same doc).
HNSW is used over IVFFlat because it builds on an empty or small table without the
training step IVFFlat needs, which matters while this table has only a handful of
rows; it can be dropped and rebuilt as IVFFlat later if the table grows very large.

Revision ID: 0014
Revises: 0013
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON_DOC = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
EMBEDDING_DIMENSIONS = 768

RESOURCE_STATUS = sa.Enum(
    "draft", "published", "retired", name="resourcestatus", native_enum=False, length=20
)
EXTRACTION_QUALITY = sa.Enum(
    "ok", "empty", "scanned", "low_text", name="extractionquality", native_enum=False, length=20
)

TABLES = ["resources", "resource_chunks"]


def upgrade() -> None:
    is_postgres = op.get_bind().dialect.name == "postgresql"
    if is_postgres:
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "resources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("subject", sa.String(length=50), nullable=False),
        sa.Column("topic_code", sa.String(length=30), nullable=True),
        sa.Column("status", RESOURCE_STATUS, nullable=False),
        sa.Column("file_hash", sa.String(length=64), nullable=False),
        sa.Column("file_key", sa.String(length=300), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=False),
        sa.Column("page_report", JSON_DOC, nullable=False, server_default="[]"),
        sa.Column("created_by", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("code", "version"),
    )
    op.create_index("ix_resources_code", "resources", ["code"])
    op.create_index("ix_resources_topic_code", "resources", ["topic_code"])
    op.create_index("ix_resources_file_hash", "resources", ["file_hash"])

    # vector(768) is created directly for Postgres; SQLite (tests only) gets a plain
    # JSON column, matching how the ORM model declares the dual-dialect type.
    op.create_table(
        "resource_chunks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "resource_id",
            sa.Integer(),
            sa.ForeignKey("resources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("heading", sa.String(length=300), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("char_count", sa.Integer(), nullable=False),
        sa.Column("extraction_quality", EXTRACTION_QUALITY, nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "embedding",
            Vector(EMBEDDING_DIMENSIONS) if is_postgres else JSON_DOC,
            nullable=True,
        ),
        sa.Column("embedding_model", sa.String(length=100), nullable=True),
        sa.Column("embedded_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("resource_id", "chunk_index"),
    )
    op.create_index("ix_resource_chunks_resource_id", "resource_chunks", ["resource_id"])
    op.create_index("ix_resource_chunks_page_number", "resource_chunks", ["page_number"])
    op.create_index("ix_resource_chunks_content_hash", "resource_chunks", ["content_hash"])

    if is_postgres:
        # Cosine distance, because embeddings are compared by direction, not size -
        # gemini-embedding-001 truncated to 768 dims is not unit length, and cosine
        # distance is scale-invariant, so that is exactly right (see docs/rag-resources.md).
        op.create_index(
            "ix_resource_chunks_embedding_cosine",
            "resource_chunks",
            ["embedding"],
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        )

    op.add_column("papers", sa.Column("grounded_in", JSON_DOC, nullable=False, server_default="[]"))

    _enable_row_level_security()


def _enable_row_level_security() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_column("papers", "grounded_in")
    is_postgres = op.get_bind().dialect.name == "postgresql"
    if is_postgres:
        op.execute("DROP INDEX IF EXISTS ix_resource_chunks_embedding_cosine")
    op.drop_table("resource_chunks")
    op.drop_table("resources")
