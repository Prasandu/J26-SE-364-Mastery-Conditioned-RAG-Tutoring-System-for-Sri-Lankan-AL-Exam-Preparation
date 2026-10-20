"""Add tabulated data to a question, e.g. a set of experimental readings it refers to.

{"headers": [...], "rows": [[...], ...]} - the only way to show tabular data at all.
A question still cannot show a graph or a diagram (see app/ai/author.py's
SYSTEM_PROMPT); this closes the gap for the one kind of visual content that is
really just structured text.

Revision ID: 0019
Revises: 0018
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON_DOC = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.add_column("questions", sa.Column("table", JSON_DOC, nullable=True))


def downgrade() -> None:
    op.drop_column("questions", "table")
