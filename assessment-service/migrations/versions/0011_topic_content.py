"""Keep what the syllabus says each topic covers, so generated questions stay inside it.

One bullet per line, taken from the NIE syllabus contents column.

Revision ID: 0011
Revises: 0010
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("topics", sa.Column("content", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("topics", "content")
