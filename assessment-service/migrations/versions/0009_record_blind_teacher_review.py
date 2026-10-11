"""Record whether the teacher saw the machine's decision before making their own.

Only blind decisions are a fair test of the machine, so the two must be told apart.

Revision ID: 0009
Revises: 0008
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable: points reviewed before this change have no honest answer, and
    # guessing "blind" for them would overstate the result.
    op.add_column("point_results", sa.Column("teacher_saw_machine", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("point_results", "teacher_saw_machine")
