"""Add notifications and notification preferences.

Revision ID: 0007_notifications
Revises: 0006_task_timer
Create Date: 2026-10-20
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007_notifications"
down_revision = "0006_task_timer"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.String(length=120), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=True),
        sa.Column("action", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("dedupe_key", sa.String(length=160), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("type IN ('reminder', 'missed', 'info')", name="ck_notifications_type"),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["planning.study_tasks.id"],
            name="fk_notifications_task_id_study_tasks",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_notifications"),
        sa.UniqueConstraint("student_id", "dedupe_key", name="uq_notifications_student_dedupe"),
        schema="planning",
    )
    op.create_index(
        "ix_notifications_student_created",
        "notifications",
        ["student_id", "created_at"],
        schema="planning",
    )
    op.create_table(
        "notification_preferences",
        sa.Column("student_id", sa.String(length=120), nullable=False),
        sa.Column("reminder_lead_minutes", sa.Integer(), server_default="10", nullable=False),
        sa.Column("quiet_hours_start", sa.Time(), server_default=sa.text("'22:00'"), nullable=False),
        sa.Column("quiet_hours_end", sa.Time(), server_default=sa.text("'06:00'"), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "reminder_lead_minutes >= 0 AND reminder_lead_minutes <= 120",
            name="ck_notification_preferences_lead",
        ),
        sa.PrimaryKeyConstraint("student_id", name="pk_notification_preferences"),
        schema="planning",
    )


def downgrade() -> None:
    op.drop_table("notification_preferences", schema="planning")
    op.drop_index("ix_notifications_student_created", table_name="notifications", schema="planning")
    op.drop_table("notifications", schema="planning")
