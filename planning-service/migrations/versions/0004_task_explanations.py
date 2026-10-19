"""Persist structured task explanations and activity steps.

Revision ID: 0004_task_explanations
Revises: 0003_question_bank
Create Date: 2026-10-18
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_task_explanations"
down_revision = "0003_question_bank"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "study_tasks",
        sa.Column("reason_details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        schema="planning",
    )
    op.add_column(
        "study_tasks",
        sa.Column("steps", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        schema="planning",
    )
    op.execute(
        """
        UPDATE planning.study_tasks
        SET reason_details = jsonb_build_object(
            'topic', topic_id,
            'sub_topic', NULL,
            'mastery', 0.0,
            'trend', 0.0,
            'decline_alert', NULL,
            'exam_weight', 0.0,
            'days_to_exam', 0,
            'main_factors', '{}'::jsonb,
            'activity_recommendation', 'Review this topic and complete the recommended practice questions.'
        ),
        steps = '[]'::jsonb
        """
    )
    op.alter_column(
        "study_tasks",
        "reason_details",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        nullable=False,
        schema="planning",
    )
    op.alter_column(
        "study_tasks",
        "steps",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        nullable=False,
        schema="planning",
    )


def downgrade() -> None:
    op.drop_column("study_tasks", "steps", schema="planning")
    op.drop_column("study_tasks", "reason_details", schema="planning")
