"""AI-suggested topic tags for a question, kept apart from what was actually applied.

A suggestion never changes question_topics by itself - that only happens when an
admin approves one (see app/services/topics_classify.py). This table is the record
of what the classifier said, and whether a person agreed with it.

Revision ID: 0015
Revises: 0014
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON_DOC = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
SUGGESTION_STATUS = sa.Enum(
    "pending", "approved", "rejected", name="suggestionstatus", native_enum=False, length=20
)

TABLES = ["topic_suggestions"]


def upgrade() -> None:
    op.create_table(
        "topic_suggestions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "question_id",
            sa.Integer(),
            sa.ForeignKey("questions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("suggested_codes", JSON_DOC, nullable=False, server_default="[]"),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("status", SUGGESTION_STATUS, nullable=False),
        sa.Column("approved_codes", JSON_DOC, nullable=True),
        sa.Column("decided_by", sa.String(length=64), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_topic_suggestions_question_id", "topic_suggestions", ["question_id"])

    _enable_row_level_security()


def _enable_row_level_security() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("topic_suggestions")
