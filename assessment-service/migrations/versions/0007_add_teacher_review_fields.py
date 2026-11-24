"""Record a teacher's own decision on a marking point, beside the machine markers'.

Revision ID: 0007
Revises: 0006
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = (
    ("teacher_awarded", sa.Boolean()),
    ("teacher_comment", sa.Text()),
    ("reviewed_by", sa.String(length=64)),
    ("reviewed_at", sa.DateTime(timezone=True)),
)


def upgrade() -> None:
    for name, column_type in COLUMNS:
        op.add_column("point_results", sa.Column(name, column_type, nullable=True))
    # The review queue is read by status, so give it an index.
    op.create_index("ix_point_results_status", "point_results", ["status"])


def downgrade() -> None:
    op.drop_index("ix_point_results_status", "point_results")
    for name, _ in COLUMNS:
        op.drop_column("point_results", name)
