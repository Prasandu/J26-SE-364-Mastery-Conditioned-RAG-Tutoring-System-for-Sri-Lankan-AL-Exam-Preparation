"""Add roadmap_weeks table for rolling-horizon planning.

Revision ID: 0005_roadmap_weeks
Revises: 0004_task_explanations
Create Date: 2026-10-19
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005_roadmap_weeks"
down_revision = "0004_task_explanations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "roadmap_weeks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.String(length=120), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("label", sa.String(length=20), nullable=False, server_default="forecast"),
        sa.Column("topics", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("total_hours", sa.Float(), nullable=False, server_default="0"),
        sa.Column("weeks_to_exam", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("compressed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("compression_note", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "label IN ('forecast', 'committed')",
            name="ck_roadmap_weeks_label",
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["planning.study_plans.id"],
            name="fk_roadmap_weeks_plan_id_study_plans",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_roadmap_weeks"),
        schema="planning",
    )
    op.create_index(
        "ix_roadmap_weeks_plan_week_start",
        "roadmap_weeks",
        ["plan_id", "week_start"],
        schema="planning",
    )


def downgrade() -> None:
    op.drop_index("ix_roadmap_weeks_plan_week_start", table_name="roadmap_weeks", schema="planning")
    op.drop_table("roadmap_weeks", schema="planning")
