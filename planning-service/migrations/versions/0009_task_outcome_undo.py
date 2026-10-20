"""Track when task outcomes are recorded and undone.

Revision ID: 0009_task_outcome_undo
Revises: 0008_motivation_state
Create Date: 2026-10-20
"""

import sqlalchemy as sa
from alembic import op

revision = "0009_task_outcome_undo"
down_revision = "0008_motivation_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "study_tasks",
        sa.Column("outcome_recorded_at", sa.DateTime(timezone=True), nullable=True),
        schema="planning",
    )
    op.add_column(
        "study_tasks",
        sa.Column("undone_at", sa.DateTime(timezone=True), nullable=True),
        schema="planning",
    )


def downgrade() -> None:
    op.drop_column("study_tasks", "undone_at", schema="planning")
    op.drop_column("study_tasks", "outcome_recorded_at", schema="planning")
