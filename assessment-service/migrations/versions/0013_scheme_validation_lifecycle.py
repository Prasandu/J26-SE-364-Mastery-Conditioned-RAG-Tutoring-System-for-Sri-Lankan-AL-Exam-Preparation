"""Record what the validators found, and who approved a marking scheme.

The status column is left exactly as it is. It already holds "draft" and "published",
which are two of the six values the scheme lifecycle now uses, so every existing row
keeps its meaning and no value is rewritten. The new statuses only ever appear on rows
that go through validation or approval from here on.

Revision ID: 0013
Revises: 0012
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# JSONB on Postgres, plain JSON on SQLite, matching app/models/base.py.
JSON_DOC = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

NEW_COLUMNS = (
    # Not null, with an empty list as the default: every scheme has a findings list,
    # and an empty one says "nothing was found". It must not be read as "never checked"
    # - validated_at is what says whether a pass has run at all, and it stays null for
    # the schemes that existed before this.
    sa.Column("validation_reasons", JSON_DOC, nullable=False, server_default="[]"),
    sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("checked_by", sa.String(length=200), nullable=True),
    sa.Column("approved_by", sa.String(length=64), nullable=True),
    sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
)


def upgrade() -> None:
    for column in NEW_COLUMNS:
        op.add_column("marking_schemes", column)


def downgrade() -> None:
    for column in reversed(NEW_COLUMNS):
        op.drop_column("marking_schemes", column.name)
