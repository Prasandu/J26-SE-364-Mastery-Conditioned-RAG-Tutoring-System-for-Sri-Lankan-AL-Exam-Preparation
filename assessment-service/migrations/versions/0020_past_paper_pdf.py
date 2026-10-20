"""Store the original PDF for past papers, shown to students as-is instead of OCR'd
text, plus which page each question starts on.

Revision ID: 0020
Revises: 0019
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("papers", sa.Column("file_key", sa.String(300), nullable=True))
    op.add_column("papers", sa.Column("page_count", sa.Integer(), nullable=True))
    op.add_column("questions", sa.Column("start_page", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("questions", "start_page")
    op.drop_column("papers", "page_count")
    op.drop_column("papers", "file_key")
