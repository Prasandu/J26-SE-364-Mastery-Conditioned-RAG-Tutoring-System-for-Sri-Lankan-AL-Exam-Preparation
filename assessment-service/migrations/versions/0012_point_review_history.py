"""Keep every teacher decision on a marking point, not just the latest.

point_results still holds the decision that counts. This table is the log behind it,
so a changed mind or a second marker does not erase what was decided before.

Revision ID: 0012
Revises: 0011
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "point_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "point_result_id",
            sa.Integer(),
            sa.ForeignKey("point_results.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("awarded", sa.Boolean(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("teacher_ref", sa.String(length=64), nullable=False),
        # Nullable on purpose: a decision made before blind review existed cannot be
        # called blind, and must not be recorded as if it were.
        sa.Column("saw_machine", sa.Boolean(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_point_reviews_point_result_id", "point_reviews", ["point_result_id"])
    op.create_index("ix_point_reviews_teacher_ref", "point_reviews", ["teacher_ref"])


def downgrade() -> None:
    op.drop_index("ix_point_reviews_teacher_ref", table_name="point_reviews")
    op.drop_index("ix_point_reviews_point_result_id", table_name="point_reviews")
    op.drop_table("point_reviews")
