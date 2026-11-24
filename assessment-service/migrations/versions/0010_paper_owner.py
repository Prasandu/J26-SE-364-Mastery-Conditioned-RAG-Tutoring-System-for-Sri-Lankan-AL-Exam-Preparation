"""Remember who made a paper, so a student's practice paper stays their own.

Empty means the paper belongs to everyone: a past paper, or one an admin published.

Revision ID: 0010
Revises: 0009
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("papers", sa.Column("created_by", sa.String(length=64), nullable=True))
    op.create_index("ix_papers_created_by", "papers", ["created_by"])


def downgrade() -> None:
    op.drop_index("ix_papers_created_by", table_name="papers")
    op.drop_column("papers", "created_by")
