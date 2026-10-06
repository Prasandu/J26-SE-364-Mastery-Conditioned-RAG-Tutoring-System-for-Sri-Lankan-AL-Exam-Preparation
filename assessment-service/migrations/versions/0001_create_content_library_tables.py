"""Create content library tables (papers, questions, marking schemes).

Revision ID: 0001
Revises:

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "papers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("subject", sa.String(length=50), nullable=False),
        sa.Column(
            "kind", sa.Enum("past", "model", name="paperkind", native_enum=False, length=20), nullable=False
        ),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("draft", "published", name="contentstatus", native_enum=False, length=20),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "topics",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["topics.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    with op.batch_alter_table("topics", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_topics_parent_id"), ["parent_id"], unique=False)

    op.create_table(
        "marking_schemes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("paper_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "source",
            sa.Enum("official", "teacher", "generated", name="schemesource", native_enum=False, length=20),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("draft", "published", name="contentstatus", native_enum=False, length=20),
            nullable=False,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("paper_id", "version"),
    )
    op.create_table(
        "sections",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("paper_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column(
            "answer_mode",
            sa.Enum("mcq", "structured", "essay", name="answermode", native_enum=False, length=20),
            nullable=False,
        ),
        sa.Column("choose_count", sa.Integer(), nullable=True),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("order_no", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("sections", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_sections_paper_id"), ["paper_id"], unique=False)

    op.create_table(
        "questions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("section_id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("label", sa.String(length=20), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("max_marks", sa.Float(), nullable=True),
        sa.Column(
            "options",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=True,
        ),
        sa.Column("order_no", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["questions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["section_id"], ["sections.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("questions", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_questions_parent_id"), ["parent_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_questions_section_id"), ["section_id"], unique=False)

    op.create_table(
        "marking_points",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scheme_id", sa.Integer(), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("marks", sa.Float(), nullable=False),
        sa.Column(
            "point_type",
            sa.Enum(
                "mcq_key",
                "concept",
                "equation",
                "formula",
                "calculation",
                "unit",
                "diagram",
                "graph",
                name="pointtype",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column(
            "expected",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=True,
        ),
        sa.Column(
            "alternatives",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column("order_no", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["scheme_id"], ["marking_schemes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scheme_id", "question_id", "code"),
    )
    with op.batch_alter_table("marking_points", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_marking_points_question_id"), ["question_id"], unique=False)

    op.create_table(
        "marking_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scheme_id", sa.Integer(), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column(
            "rule_type",
            sa.Enum("max_marks", "any_n_of", "ecf", name="ruletype", native_enum=False, length=20),
            nullable=False,
        ),
        sa.Column(
            "params",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["scheme_id"], ["marking_schemes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("marking_rules", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_marking_rules_question_id"), ["question_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_marking_rules_scheme_id"), ["scheme_id"], unique=False)

    op.create_table(
        "model_answers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scheme_id", sa.Integer(), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("answer_text", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["scheme_id"], ["marking_schemes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scheme_id", "question_id"),
    )
    with op.batch_alter_table("model_answers", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_model_answers_question_id"), ["question_id"], unique=False)

    op.create_table(
        "question_topics",
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("topic_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("question_id", "topic_id"),
    )
    with op.batch_alter_table("question_topics", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_question_topics_topic_id"), ["topic_id"], unique=False)

    _enable_row_level_security()


# Supabase exposes the public schema through its Data API (with the public "anon" key).
# Row Level Security with no policies blocks that API from reading these tables
# (e.g. marking schemes). The backend connects as the table owner, so it is not affected.
TABLES = [
    "papers",
    "topics",
    "marking_schemes",
    "sections",
    "questions",
    "marking_points",
    "marking_rules",
    "model_answers",
    "question_topics",
]


def _enable_row_level_security() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("question_topics", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_question_topics_topic_id"))

    op.drop_table("question_topics")
    with op.batch_alter_table("model_answers", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_model_answers_question_id"))

    op.drop_table("model_answers")
    with op.batch_alter_table("marking_rules", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_marking_rules_scheme_id"))
        batch_op.drop_index(batch_op.f("ix_marking_rules_question_id"))

    op.drop_table("marking_rules")
    with op.batch_alter_table("marking_points", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_marking_points_question_id"))

    op.drop_table("marking_points")
    with op.batch_alter_table("questions", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_questions_section_id"))
        batch_op.drop_index(batch_op.f("ix_questions_parent_id"))

    op.drop_table("questions")
    with op.batch_alter_table("sections", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_sections_paper_id"))

    op.drop_table("sections")
    op.drop_table("marking_schemes")
    with op.batch_alter_table("topics", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_topics_parent_id"))

    op.drop_table("topics")
    op.drop_table("papers")
