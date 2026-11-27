"""Row-level security on the tables that were created without it.

Every assessment table gets RLS with no policies (0001, 0003, 0008, 0014, 0015, 0017):
Supabase exposes the `public` schema through its REST API to the anon/authenticated
roles, and RLS with no policy denies those roles, while this service connects as the
table owner (which bypasses RLS). 0012 (point_reviews - teachers' decisions on each
student's points) and 0021 (topic_edges) skipped that step; found by
scripts/db/shared_db_smoke.py. alembic_version is included so no public table is left
readable through the REST API.

Revision ID: 0023
Revises: 0022
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ("point_reviews", "topic_edges", "alembic_version")


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
