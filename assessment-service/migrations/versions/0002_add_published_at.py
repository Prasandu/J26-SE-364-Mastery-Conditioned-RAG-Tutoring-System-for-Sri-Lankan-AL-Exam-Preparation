"""Add published_at to papers and marking schemes.

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ["papers", "marking_schemes"]


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
        # Content published before this column existed: best known date is when it was created.
        op.execute(f"UPDATE {table} SET published_at = created_at WHERE status = 'published'")


def downgrade() -> None:
    for table in TABLES:
        op.drop_column(table, "published_at")
