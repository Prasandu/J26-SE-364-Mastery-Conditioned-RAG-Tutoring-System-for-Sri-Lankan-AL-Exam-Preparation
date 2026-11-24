"""Record that a photographed answer contains a drawing the reader could not transcribe.

The vision reader already reports this per page, but it was thrown away. Keeping it
lets the review queue tell a teacher that the text alone is not the whole answer.

Revision ID: 0016
Revises: 0015
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing answers were read before this was recorded: false means "not known to
    # have one", which is how every row behaved until now anyway.
    op.add_column(
        "answers",
        sa.Column("has_drawing", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("answers", "has_drawing")
