"""Link an account to its Supabase Auth user, the identity shared by all four components.

The integrated web app signs everyone in with Supabase Auth; this service accepts
those tokens and finds (or creates) the users row whose supabase_user_id is the
token's `sub`. Nullable: accounts made by app/create_admin.py or POST /auth/register
stay local-only until linked.

Revision ID: 0022
Revises: 0021
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("supabase_user_id", sa.String(length=36), nullable=True))
        batch.create_index("ix_users_supabase_user_id", ["supabase_user_id"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_index("ix_users_supabase_user_id")
        batch.drop_column("supabase_user_id")
