"""Add reason and marker to point results (which marker decided, and why).

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("point_results", sa.Column("reason", sa.Text(), nullable=True))
    op.add_column("point_results", sa.Column("marker", sa.String(length=100), nullable=True))
    # Rows created before this column existed were all decided by the MCQ key rule.
    op.execute("UPDATE point_results SET marker = 'mcq-key' WHERE method = 'rule'")


def downgrade() -> None:
    op.drop_column("point_results", "marker")
    op.drop_column("point_results", "reason")
