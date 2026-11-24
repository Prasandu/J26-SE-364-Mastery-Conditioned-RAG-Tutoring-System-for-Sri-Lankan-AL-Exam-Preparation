"""Record what the checker and the AI each decided, so their agreement can be measured.

Revision ID: 0005
Revises: 0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = ["checker_awarded", "ai_awarded"]


def upgrade() -> None:
    for column in COLUMNS:
        op.add_column("point_results", sa.Column(column, sa.Boolean(), nullable=True))


def downgrade() -> None:
    for column in COLUMNS:
        op.drop_column("point_results", column)
