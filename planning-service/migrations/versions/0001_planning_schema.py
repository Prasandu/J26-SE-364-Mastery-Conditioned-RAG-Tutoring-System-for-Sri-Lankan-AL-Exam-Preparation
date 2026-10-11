"""Create the planning schema.

Revision ID: 0001_planning_schema
Revises:
Create Date: 2026-10-11
"""

import pgvector.sqlalchemy
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_planning_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS planning")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "topics",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("parent_id", sa.String(length=80), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("grade_level", sa.String(length=20), nullable=True),
        sa.Column("exam_weight", sa.Float(), nullable=False),
        sa.Column("prerequisites", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.CheckConstraint("exam_weight >= 0 AND exam_weight <= 1", name="ck_topics_exam_weight"),
        sa.UniqueConstraint("code", name="uq_topics_code"),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["planning.topics.id"],
            name="fk_topics_parent_id_topics",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_topics"),
        schema="planning",
    )
    op.create_index("ix_planning_topics_parent_id", "topics", ["parent_id"], schema="planning")

    op.create_table(
        "raw_events",
        sa.Column("event_id", sa.String(length=120), nullable=False),
        sa.Column("student_id", sa.String(length=120), nullable=False),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("event_id", name="pk_raw_events"),
        schema="planning",
    )
    op.create_index(
        "ix_raw_events_student_received",
        "raw_events",
        ["student_id", "received_at"],
        schema="planning",
    )

    op.create_table(
        "study_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.String(length=120), nullable=False),
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("exam_date", sa.Date(), nullable=False),
        sa.Column("target_grade", sa.String(length=20), nullable=False),
        sa.Column("constraints", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
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
        sa.CheckConstraint("mode IN ('manual', 'predicted')", name="ck_study_plans_mode"),
        sa.PrimaryKeyConstraint("id", name="pk_study_plans"),
        schema="planning",
    )
    op.create_index(
        "ix_study_plans_student_updated",
        "study_plans",
        ["student_id", "updated_at"],
        schema="planning",
    )

    op.create_table(
        "topic_evidence",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.String(length=120), nullable=False),
        sa.Column("topic_id", sa.String(length=80), nullable=False),
        sa.Column("event_id", sa.String(length=120), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("max_score", sa.Float(), nullable=False),
        sa.Column("difficulty", sa.Float(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("score >= 0", name="ck_topic_evidence_score_nonnegative"),
        sa.CheckConstraint("max_score > 0", name="ck_topic_evidence_max_score_positive"),
        sa.CheckConstraint("score <= max_score", name="ck_topic_evidence_score_within_max"),
        sa.CheckConstraint(
            "difficulty >= 0 AND difficulty <= 1",
            name="ck_topic_evidence_difficulty",
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["planning.raw_events.event_id"],
            name="fk_topic_evidence_event_id_raw_events",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["topic_id"],
            ["planning.topics.id"],
            name="fk_topic_evidence_topic_id_topics",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_topic_evidence"),
        sa.UniqueConstraint("event_id", "topic_id", name="uq_topic_evidence_event_topic"),
        schema="planning",
    )
    op.create_index(
        "ix_topic_evidence_student_observed",
        "topic_evidence",
        ["student_id", "observed_at"],
        schema="planning",
    )

    op.create_table(
        "learner_topic_state",
        sa.Column("student_id", sa.String(length=120), nullable=False),
        sa.Column("topic_id", sa.String(length=80), nullable=False),
        sa.Column("mastery", sa.Float(), nullable=False),
        sa.Column("trend", sa.Float(), nullable=False),
        sa.Column("error_rate", sa.Float(), nullable=False),
        sa.Column("weak_score", sa.Float(), nullable=False),
        sa.Column("last_revised", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ease", sa.Float(), nullable=False),
        sa.Column("interval_days", sa.Integer(), nullable=False),
        sa.CheckConstraint("mastery >= 0 AND mastery <= 1", name="ck_learner_state_mastery"),
        sa.CheckConstraint("error_rate >= 0 AND error_rate <= 1", name="ck_learner_state_error_rate"),
        sa.CheckConstraint("weak_score >= 0 AND weak_score <= 1", name="ck_learner_state_weak_score"),
        sa.CheckConstraint("ease >= 1.3", name="ck_learner_state_ease"),
        sa.CheckConstraint("interval_days >= 0", name="ck_learner_state_interval_days"),
        sa.ForeignKeyConstraint(
            ["topic_id"],
            ["planning.topics.id"],
            name="fk_learner_topic_state_topic_id_topics",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("student_id", "topic_id", name="pk_learner_topic_state"),
        schema="planning",
    )
    op.create_index(
        "ix_learner_state_student_review",
        "learner_topic_state",
        ["student_id", "next_review_at"],
        schema="planning",
    )

    op.create_table(
        "availability_slots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.CheckConstraint("weekday >= 0 AND weekday <= 6", name="ck_availability_weekday"),
        sa.CheckConstraint("start_time < end_time", name="ck_availability_time_order"),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["planning.study_plans.id"],
            name="fk_availability_slots_plan_id_study_plans",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_availability_slots"),
        schema="planning",
    )
    op.create_index(
        "ix_availability_plan_weekday",
        "availability_slots",
        ["plan_id", "weekday"],
        schema="planning",
    )

    op.create_table(
        "study_tasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.String(length=120), nullable=False),
        sa.Column("topic_id", sa.String(length=80), nullable=False),
        sa.Column("activity", sa.String(length=80), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_min", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("replanned_from", sa.Uuid(), nullable=True),
        sa.CheckConstraint("duration_min > 0", name="ck_study_tasks_duration_positive"),
        sa.CheckConstraint(
            "status IN ('planned', 'completed', 'partial', 'missed')",
            name="ck_study_tasks_status",
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["planning.study_plans.id"],
            name="fk_study_tasks_plan_id_study_plans",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["replanned_from"],
            ["planning.study_tasks.id"],
            name="fk_study_tasks_replanned_from_study_tasks",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["topic_id"],
            ["planning.topics.id"],
            name="fk_study_tasks_topic_id_topics",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_study_tasks"),
        schema="planning",
    )
    op.create_index(
        "ix_study_tasks_student_start",
        "study_tasks",
        ["student_id", "start_at"],
        schema="planning",
    )
    op.create_index(
        "ix_study_tasks_plan_start",
        "study_tasks",
        ["plan_id", "start_at"],
        schema="planning",
    )

    op.create_table(
        "replan_log",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.String(length=120), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=True),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("changes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["planning.study_plans.id"],
            name="fk_replan_log_plan_id_study_plans",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["planning.study_tasks.id"],
            name="fk_replan_log_task_id_study_tasks",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_replan_log"),
        schema="planning",
    )
    op.create_index(
        "ix_replan_log_student_created",
        "replan_log",
        ["student_id", "created_at"],
        schema="planning",
    )

    op.create_table(
        "predictions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.String(length=120), nullable=False),
        sa.Column("topic_id", sa.String(length=80), nullable=True),
        sa.Column("predicted_score", sa.Float(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column(
            "contributing_factors",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("model_version", sa.String(length=100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["topic_id"],
            ["planning.topics.id"],
            name="fk_predictions_topic_id_topics",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_predictions"),
        schema="planning",
    )
    op.create_index(
        "ix_predictions_student_created",
        "predictions",
        ["student_id", "created_at"],
        schema="planning",
    )

    op.create_table(
        "profile_embeddings",
        sa.Column("student_id", sa.String(length=120), nullable=False),
        sa.Column("embedding", pgvector.sqlalchemy.Vector(dim=16), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("student_id", name="pk_profile_embeddings"),
        schema="planning",
    )


def downgrade() -> None:
    op.drop_table("profile_embeddings", schema="planning")
    op.drop_index("ix_predictions_student_created", table_name="predictions", schema="planning")
    op.drop_table("predictions", schema="planning")
    op.drop_index("ix_replan_log_student_created", table_name="replan_log", schema="planning")
    op.drop_table("replan_log", schema="planning")
    op.drop_index("ix_study_tasks_plan_start", table_name="study_tasks", schema="planning")
    op.drop_index("ix_study_tasks_student_start", table_name="study_tasks", schema="planning")
    op.drop_table("study_tasks", schema="planning")
    op.drop_index("ix_availability_plan_weekday", table_name="availability_slots", schema="planning")
    op.drop_table("availability_slots", schema="planning")
    op.drop_index("ix_learner_state_student_review", table_name="learner_topic_state", schema="planning")
    op.drop_table("learner_topic_state", schema="planning")
    op.drop_index(
        "ix_topic_evidence_student_observed",
        table_name="topic_evidence",
        schema="planning",
    )
    op.drop_table("topic_evidence", schema="planning")
    op.drop_index("ix_study_plans_student_updated", table_name="study_plans", schema="planning")
    op.drop_table("study_plans", schema="planning")
    op.drop_index("ix_raw_events_student_received", table_name="raw_events", schema="planning")
    op.drop_table("raw_events", schema="planning")
    op.drop_index("ix_planning_topics_parent_id", table_name="topics", schema="planning")
    op.drop_table("topics", schema="planning")
