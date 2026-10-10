"""Store uploaded answer photos and what the vision model read from them.

Revision ID: 0008
Revises: 0007
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ANSWER_COLUMNS = (
    ("extracted_text", sa.Text(), None),
    ("reader", sa.String(length=100), None),
    ("reading_confidence", sa.Float(), None),
    ("corrected_by_student", sa.Boolean(), sa.false()),
)


def upgrade() -> None:
    for name, column_type, default in ANSWER_COLUMNS:
        op.add_column(
            "answers",
            sa.Column(name, column_type, nullable=default is None, server_default=default),
        )

    op.create_table(
        "answer_images",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("answer_id", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(length=300), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("order_no", sa.Integer(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["answer_id"], ["answers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_answer_images_answer_id", "answer_images", ["answer_id"])

    # Uploaded scripts are private student work (NFR3), as in 0001.
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE answer_images ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("answer_images")
    for name, _, _ in ANSWER_COLUMNS:
        op.drop_column("answers", name)
