"""add full-text search column to knowledge_chunks for hybrid retrieval

Revision ID: b7c3f1a9d2e4
Revises: 0adcd9c7d49c
Create Date: 2026-10-20 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7c3f1a9d2e4"
down_revision: Union[str, None] = "0adcd9c7d49c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE support.knowledge_chunks
        ADD COLUMN content_tsv tsvector
        GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
        """
    )
    op.execute(
        """
        CREATE INDEX ix_knowledge_chunks_content_tsv
        ON support.knowledge_chunks USING GIN (content_tsv)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS support.ix_knowledge_chunks_content_tsv")
    op.execute("ALTER TABLE support.knowledge_chunks DROP COLUMN IF EXISTS content_tsv")
