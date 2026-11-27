"""add flagged_questions

The inbox other components POST wrong answers into (app/models/flagged_question.py).
The model was added after the migrations folder was removed from the repository, so
it never had a migration; this brings a fresh database (the shared Supabase project
for all four components) up to the current models.

Revision ID: c4d8e2f1a7b3
Revises: b7c3f1a9d2e4
Create Date: 2026-11-24 12:00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4d8e2f1a7b3"
down_revision: Union[str, None] = "b7c3f1a9d2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "flagged_questions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.String(length=100), nullable=False),
        sa.Column("source", sa.String(length=50), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("topic", sa.String(length=200), nullable=False),
        sa.Column("sub_topic", sa.String(length=200), nullable=True),
        sa.Column("unit", sa.String(length=20), nullable=True),
        sa.Column("concept_id", sa.String(length=50), nullable=True),
        sa.Column("submitted_answer", sa.Text(), nullable=False),
        sa.Column("correct_answer", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("explanation_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="support",
    )
    op.create_index(
        op.f("ix_support_flagged_questions_student_id"),
        "flagged_questions",
        ["student_id"],
        unique=False,
        schema="support",
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_support_flagged_questions_student_id"), table_name="flagged_questions", schema="support"
    )
    op.drop_table("flagged_questions", schema="support")
