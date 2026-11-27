"""Legacy AI marks: record review priority (operator correction 2026-11-27).

Every AI-only decision now goes back to a teacher regardless of confidence; confidence
only orders the review. Expand-only: adds a nullable column, no data changed.

Revision ID: 0026
Revises: 0025
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0026"
down_revision: str | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("legacy_ai_reclassifications", sa.Column("review_priority", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("legacy_ai_reclassifications", "review_priority")
