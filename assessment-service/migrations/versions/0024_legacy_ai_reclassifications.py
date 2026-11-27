"""Audit table for the legacy AI-marks policy (operator decision 2026-11-27).

AI-decided points with confidence <= threshold (or none recorded) go back to teacher
review; the rest stay, labelled as AI-judged. Each run's decisions are recorded here
and can be reverted. RLS on, no policies (like every assessment table).

Revision ID: 0024
Revises: 0023
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "legacy_ai_reclassifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("run_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column(
            "point_result_id",
            sa.Integer(),
            sa.ForeignKey("point_results.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("attempt_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("previous_status", sa.String(20), nullable=False),
        sa.Column("previous_awarded", sa.Float(), nullable=False),
        sa.Column("previous_attempt_status", sa.String(20), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("reverted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_legacy_ai_reclassifications_run_id", "legacy_ai_reclassifications", ["run_id"])
    op.create_index(
        "ix_legacy_ai_reclassifications_point_result_id", "legacy_ai_reclassifications", ["point_result_id"]
    )
    op.create_index(
        "ix_legacy_ai_reclassifications_attempt_id", "legacy_ai_reclassifications", ["attempt_id"]
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE legacy_ai_reclassifications ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index("ix_legacy_ai_reclassifications_attempt_id", table_name="legacy_ai_reclassifications")
    op.drop_index("ix_legacy_ai_reclassifications_point_result_id", table_name="legacy_ai_reclassifications")
    op.drop_index("ix_legacy_ai_reclassifications_run_id", table_name="legacy_ai_reclassifications")
    op.drop_table("legacy_ai_reclassifications")
