"""Add server-backed study timer columns to study_tasks.

Revision ID: 0006_task_timer
Revises: 0005_roadmap_weeks
Create Date: 2026-10-20
"""

import sqlalchemy as sa
from alembic import op

revision = "0006_task_timer"
down_revision = "0005_roadmap_weeks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "study_tasks",
        sa.Column("timer_state", sa.String(length=20), nullable=False, server_default="idle"),
        schema="planning",
    )
    op.add_column(
        "study_tasks",
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        schema="planning",
    )
    op.add_column(
        "study_tasks",
        sa.Column("last_resumed_at", sa.DateTime(timezone=True), nullable=True),
        schema="planning",
    )
    op.add_column(
        "study_tasks",
        sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True),
        schema="planning",
    )
    op.add_column(
        "study_tasks",
        sa.Column("paused_total_sec", sa.Integer(), nullable=False, server_default="0"),
        schema="planning",
    )
    op.create_check_constraint(
        "ck_study_tasks_timer_state",
        "study_tasks",
        "timer_state IN ('idle', 'running', 'paused', 'finished')",
        schema="planning",
    )
    op.create_check_constraint(
        "ck_study_tasks_paused_total",
        "study_tasks",
        "paused_total_sec >= 0",
        schema="planning",
    )
    op.create_index(
        "ix_study_tasks_student_timer_running",
        "study_tasks",
        ["student_id"],
        unique=True,
        schema="planning",
        postgresql_where=sa.text("timer_state = 'running'"),
    )


def downgrade() -> None:
    op.drop_index("ix_study_tasks_student_timer_running", table_name="study_tasks", schema="planning")
    op.drop_constraint("ck_study_tasks_paused_total", "study_tasks", schema="planning")
    op.drop_constraint("ck_study_tasks_timer_state", "study_tasks", schema="planning")
    for column in ("paused_total_sec", "paused_at", "last_resumed_at", "started_at", "timer_state"):
        op.drop_column("study_tasks", column, schema="planning")
