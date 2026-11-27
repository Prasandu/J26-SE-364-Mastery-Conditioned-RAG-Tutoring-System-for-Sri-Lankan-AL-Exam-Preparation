"""Real user accounts: the team's shared login.

Replaces two things (see app/security.py and app/services/auth.py): the shared
ADMIN_API_KEY / TEACHER_API_KEY .env keys staff routes used before this existed
(removed - see app/security.py), and the free-text student_ref a student could
previously type as anyone.

A role is a tier, not an independent permission set: ADMIN can do everything TEACHER
can, which can do everything STUDENT can (see ROLE_RANK in app/services/auth.py).
Nobody can register as TEACHER or ADMIN - the public form always creates a STUDENT;
an admin promotes an existing account, or the very first admin is made by
app/create_admin.py, run once from the command line, never over HTTP.
"""

from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import text_enum, utcnow


class UserRole(StrEnum):
    STUDENT = "student"
    TEACHER = "teacher"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Case-insensitive on purpose (see app/services/auth.py's normalize_email) -
    # stored lowercase so the uniqueness constraint actually catches a repeat signup.
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    # Empty for an account that only ever signs in through Supabase Auth (see
    # supabase_user_id) - authenticate_user refuses a password login for it.
    password_hash: Mapped[str] = mapped_column(String(100))
    # The Supabase Auth user id (the token's `sub`, a UUID) this account belongs to:
    # the one identity shared by all four components. None = a local-only account.
    supabase_user_id: Mapped[str | None] = mapped_column(String(36), unique=True, index=True, default=None)
    role: Mapped[UserRole] = mapped_column(text_enum(UserRole), default=UserRole.STUDENT)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
