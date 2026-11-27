"""DAT-010 consumer: ledger of finalized assessment marks, rejected events, pull cursor.

Revision ID: 0010_assessment_decisions
Revises: 0009_task_outcome_undo
Create Date: 2026-11-27
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010_assessment_decisions"
down_revision = "0009_task_outcome_undo"
branch_labels = None
depends_on = None

NOW = sa.text("now()")


def upgrade() -> None:
    op.create_table(
        "assessment_decisions",
        sa.Column("event_id", sa.String(120), primary_key=True),
        sa.Column("source_entity_id", sa.String(200), nullable=False),
        sa.Column("source_version", sa.Integer(), nullable=False),
        sa.Column("subject_user_id", sa.String(120), nullable=False),
        sa.Column("evidence_class", sa.String(40), nullable=False),
        sa.Column("source_topic_codes", postgresql.JSONB(), nullable=False),
        sa.Column("topic_ids", postgresql.JSONB(), nullable=False),
        sa.Column("score_awarded", sa.Float(), nullable=False),
        sa.Column("score_maximum", sa.Float(), nullable=False),
        sa.Column("source_paper_id", sa.String(40), nullable=True),
        sa.Column("assessed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("reason", sa.String(300), nullable=True),
        sa.Column("superseded_by", sa.String(120), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.PrimaryKeyConstraint("event_id", name="pk_assessment_decisions"),
        sa.UniqueConstraint(
            "source_entity_id", "source_version", name="uq_assessment_decisions_entity_version"
        ),
        sa.CheckConstraint(
            "status IN ('applied', 'superseded', 'stale', 'quarantined', 'legacy_unverified')",
            name="ck_assessment_decisions_status",
        ),
        sa.CheckConstraint("source_version >= 0", name="ck_assessment_decisions_version"),
        sa.CheckConstraint(
            "score_awarded >= 0 AND score_maximum > 0 AND score_awarded <= score_maximum",
            name="ck_assessment_decisions_score",
        ),
        schema="planning",
    )
    op.create_index(
        "ix_assessment_decisions_subject", "assessment_decisions", ["subject_user_id"], schema="planning"
    )
    op.create_index("ix_assessment_decisions_status", "assessment_decisions", ["status"], schema="planning")
    # Never two applied versions of one assessment point, whatever the code does.
    op.create_index(
        "uq_assessment_decisions_one_applied",
        "assessment_decisions",
        ["source_entity_id"],
        unique=True,
        schema="planning",
        postgresql_where=sa.text("status = 'applied'"),
    )

    op.create_table(
        "integration_rejections",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("source", sa.String(80), nullable=False),
        sa.Column("event_id", sa.String(120), nullable=True),
        sa.Column("reason", sa.String(300), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.PrimaryKeyConstraint("id", name="pk_integration_rejections"),
        sa.UniqueConstraint("fingerprint", name="uq_integration_rejections_fingerprint"),
        schema="planning",
    )
    op.create_index(
        "ix_integration_rejections_source_received",
        "integration_rejections",
        ["source", "received_at"],
        schema="planning",
    )

    op.create_table(
        "integration_cursors",
        sa.Column("source", sa.String(80), primary_key=True),
        sa.Column("high_water", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(300), nullable=True),
        sa.PrimaryKeyConstraint("source", name="pk_integration_cursors"),
        schema="planning",
    )


def downgrade() -> None:
    op.drop_table("integration_cursors", schema="planning")
    op.drop_index(
        "ix_integration_rejections_source_received", table_name="integration_rejections", schema="planning"
    )
    op.drop_table("integration_rejections", schema="planning")
    op.drop_index("uq_assessment_decisions_one_applied", table_name="assessment_decisions", schema="planning")
    op.drop_index("ix_assessment_decisions_status", table_name="assessment_decisions", schema="planning")
    op.drop_index("ix_assessment_decisions_subject", table_name="assessment_decisions", schema="planning")
    op.drop_table("assessment_decisions", schema="planning")
