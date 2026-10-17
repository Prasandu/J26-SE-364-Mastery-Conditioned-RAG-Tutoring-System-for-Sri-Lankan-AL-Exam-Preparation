"""Add paper and question-level assessment tracking.

Revision ID: 0003_question_bank
Revises: 0002_task_outcomes
Create Date: 2026-10-17
"""

import sqlalchemy as sa
from alembic import op

revision = "0003_question_bank"
down_revision = "0002_task_outcomes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "papers",
        sa.Column("paper_id", sa.String(length=120), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=80), nullable=False),
        sa.Column("total_marks", sa.Float(), nullable=False),
        sa.CheckConstraint("year >= 1900 AND year <= 2200", name="ck_papers_year"),
        sa.CheckConstraint("total_marks > 0", name="ck_papers_total_marks"),
        sa.PrimaryKeyConstraint("paper_id", name="pk_papers"),
        schema="planning",
    )
    op.create_table(
        "questions",
        sa.Column("question_id", sa.String(length=120), nullable=False),
        sa.Column("paper_id", sa.String(length=120), nullable=False),
        sa.Column("question_no", sa.String(length=40), nullable=False),
        sa.Column("topic_id", sa.String(length=80), nullable=False),
        sa.Column("sub_topic_id", sa.String(length=80), nullable=True),
        sa.Column("max_marks", sa.Float(), nullable=False),
        sa.CheckConstraint("max_marks > 0", name="ck_questions_max_marks"),
        sa.ForeignKeyConstraint(
            ["paper_id"],
            ["planning.papers.paper_id"],
            name="fk_questions_paper_id_papers",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["topic_id"],
            ["planning.topics.id"],
            name="fk_questions_topic_id_topics",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["sub_topic_id"],
            ["planning.topics.id"],
            name="fk_questions_sub_topic_id_topics",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("question_id", name="pk_questions"),
        schema="planning",
    )
    op.create_index(
        "ix_planning_questions_paper_id",
        "questions",
        ["paper_id"],
        schema="planning",
    )
    op.add_column(
        "raw_events",
        sa.Column("paper_id", sa.String(length=120), nullable=True),
        schema="planning",
    )
    op.add_column(
        "raw_events",
        sa.Column("paper_year", sa.Integer(), nullable=True),
        schema="planning",
    )
    op.add_column(
        "topic_evidence",
        sa.Column("question_id", sa.String(length=120), nullable=True),
        schema="planning",
    )
    op.create_foreign_key(
        "fk_topic_evidence_question_id_questions",
        "topic_evidence",
        "questions",
        ["question_id"],
        ["question_id"],
        source_schema="planning",
        referent_schema="planning",
        ondelete="SET NULL",
    )
    op.drop_constraint(
        "uq_topic_evidence_event_topic",
        "topic_evidence",
        schema="planning",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_topic_evidence_event_topic_question",
        "topic_evidence",
        ["event_id", "topic_id", "question_id"],
        schema="planning",
    )
    op.create_index(
        "uq_topic_evidence_event_topic_unlinked",
        "topic_evidence",
        ["event_id", "topic_id"],
        unique=True,
        schema="planning",
        postgresql_where=sa.text("question_id IS NULL"),
    )
    op.execute(
        "CREATE VIEW planning.attempts AS "
        "SELECT te.id AS attempt_id, te.student_id, te.question_id, te.topic_id, "
        "te.score AS marks, te.max_score AS max_marks, te.observed_at AS attempted_at, "
        "re.paper_id, re.paper_year "
        "FROM planning.topic_evidence AS te "
        "JOIN planning.raw_events AS re ON re.event_id = te.event_id"
    )


def downgrade() -> None:
    op.execute("DROP VIEW planning.attempts")
    op.drop_index(
        "uq_topic_evidence_event_topic_unlinked",
        table_name="topic_evidence",
        schema="planning",
    )
    op.drop_constraint(
        "uq_topic_evidence_event_topic_question",
        "topic_evidence",
        schema="planning",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_topic_evidence_event_topic",
        "topic_evidence",
        ["event_id", "topic_id"],
        schema="planning",
    )
    op.drop_constraint(
        "fk_topic_evidence_question_id_questions",
        "topic_evidence",
        schema="planning",
        type_="foreignkey",
    )
    op.drop_column("topic_evidence", "question_id", schema="planning")
    op.drop_column("raw_events", "paper_year", schema="planning")
    op.drop_column("raw_events", "paper_id", schema="planning")
    op.drop_index("ix_planning_questions_paper_id", table_name="questions", schema="planning")
    op.drop_table("questions", schema="planning")
    op.drop_table("papers", schema="planning")
