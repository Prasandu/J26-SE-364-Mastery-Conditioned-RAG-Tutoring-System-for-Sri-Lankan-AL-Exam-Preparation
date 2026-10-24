"""Relationships between topics: the edges of the syllabus graph.

The topics table is a containment tree, so it can say U01_5 is part of U01 but not
that electrochemistry needs the mole concept first. These edges carry that, and are
proposed by a derivation pass before a teacher approves them.

Revision ID: 0021
Revises: 0020
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "topic_edges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "from_topic_id",
            sa.Integer(),
            sa.ForeignKey("topics.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "to_topic_id",
            sa.Integer(),
            sa.ForeignKey("topics.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="proposed", index=True),
        sa.Column("weight", sa.Float(), nullable=False, server_default="0"),
        sa.Column("source", sa.String(40), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=True),
        sa.Column("decided_by", sa.String(120), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("from_topic_id", "to_topic_id", "kind", name="uq_topic_edge"),
    )


def downgrade() -> None:
    op.drop_table("topic_edges")
