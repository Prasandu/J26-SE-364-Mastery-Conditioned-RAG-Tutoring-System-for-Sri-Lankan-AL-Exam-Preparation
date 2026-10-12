"""Track task duration and learning outcomes.

Revision ID: 0002_task_outcomes
Revises: 0001_planning_schema
Create Date: 2026-10-12
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_task_outcomes"
down_revision = "0001_planning_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "study_tasks", sa.Column("actual_duration_min", sa.Integer(), nullable=True), schema="planning"
    )
    op.add_column("study_tasks", sa.Column("score_before", sa.Float(), nullable=True), schema="planning")
    op.add_column("study_tasks", sa.Column("score_after", sa.Float(), nullable=True), schema="planning")
    op.create_check_constraint(
        "ck_study_tasks_actual_duration",
        "study_tasks",
        "actual_duration_min IS NULL OR (actual_duration_min >= 0 AND actual_duration_min <= duration_min)",
        schema="planning",
    )
    op.create_check_constraint(
        "ck_study_tasks_score_range",
        "study_tasks",
        "(score_before IS NULL AND score_after IS NULL) OR "
        "(score_before IS NOT NULL AND score_after IS NOT NULL AND "
        "score_before >= 0 AND score_before <= 1 AND score_after >= 0 AND score_after <= 1)",
        schema="planning",
    )


def downgrade() -> None:
    op.drop_constraint("ck_study_tasks_score_range", "study_tasks", schema="planning")
    op.drop_constraint("ck_study_tasks_actual_duration", "study_tasks", schema="planning")
    op.drop_column("study_tasks", "score_after", schema="planning")
    op.drop_column("study_tasks", "score_before", schema="planning")
    op.drop_column("study_tasks", "actual_duration_min", schema="planning")
