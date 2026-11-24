"""Add per-student shuffle-bag state for daily motivation messages.

Revision ID: 0008_motivation_state
Revises: 0007_notifications
Create Date: 2026-10-20
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008_motivation_state"
down_revision = "0007_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "motivation_state",
        sa.Column("student_id", sa.String(length=120), nullable=False),
        sa.Column(
            "shown_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("last_shown_date", sa.Date(), nullable=True),
        sa.Column("last_message_id", sa.String(length=80), nullable=True),
        sa.Column("last_category", sa.String(length=40), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("student_id", name="pk_motivation_state"),
        schema="planning",
    )


def downgrade() -> None:
    op.drop_table("motivation_state", schema="planning")
