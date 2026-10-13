"""Who may use the staff endpoints, and (from app/services/auth.py) who is signed in.

Two systems both work, on purpose: the shared key in a header (the original
stop-gap) and now real login with the right role. require_admin and require_teacher
accept either - a teacher or admin can keep using the key exactly as before, or sign
in for real, without the hundreds of tests already written against the key needing
to change. A route moves to require_role alone only once nothing still depends on
the key for that route - see the docstring in app/models/users.py.
"""

from secrets import compare_digest

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import User, UserRole
from app.services.auth import ROLE_RANK, decode_token

_admin_key_header = APIKeyHeader(
    name="X-Admin-Key", auto_error=False, description="Value of ADMIN_API_KEY in .env"
)
_teacher_key_header = APIKeyHeader(
    name="X-Teacher-Key", auto_error=False, description="Value of TEACHER_API_KEY in .env"
)
_bearer = HTTPBearer(auto_error=False, description="Access token from POST /auth/login")


# Real login (see app/services/auth.py)


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> User:
    """The signed-in user, from the Authorization: Bearer token. 401 if there is none
    or it is invalid/expired - the same response either way (see decode_token)."""
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue")
    payload = decode_token(credentials.credentials, settings)
    user = db.get(User, payload.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired or invalid, please log in again")
    return user


def optional_user(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> User | None:
    """The signed-in user if there is one, or None - for a route a visitor can use
    anonymously, but that shows more once signed in (e.g. GET /papers)."""
    if credentials is None:
        return None
    try:
        return current_user(credentials, settings, db)
    except HTTPException:
        return None


def require_role(minimum: UserRole):
    """A role is a tier (see ROLE_RANK): require_role(TEACHER) also admits an ADMIN."""

    def check(user: User = Depends(current_user)) -> User:
        if ROLE_RANK[user.role] < ROLE_RANK[minimum]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"This needs a {minimum.value} account")
        return user

    return check


# The shared keys, now also accepting a real login of the right role


def require_admin(
    key: str | None = Security(_admin_key_header),
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> None:
    if _signed_in_with_role(credentials, UserRole.ADMIN, settings, db):
        return
    _check(key, settings.admin_api_key, "Admin", "ADMIN_API_KEY")


def require_teacher(
    key: str | None = Security(_teacher_key_header),
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> None:
    if _signed_in_with_role(credentials, UserRole.TEACHER, settings, db):
        return
    _check(key, settings.teacher_api_key, "Teacher review", "TEACHER_API_KEY")


def _signed_in_with_role(
    credentials: HTTPAuthorizationCredentials | None, minimum: UserRole, settings: Settings, db: Session
) -> bool:
    """True if a real, valid token is present and its role is enough - never raises,
    so a missing or bad token just falls through to the key check instead of
    refusing a request the key alone would have accepted."""
    if credentials is None:
        return False
    try:
        user = current_user(credentials, settings, db)
    except HTTPException:
        return False
    return ROLE_RANK[user.role] >= ROLE_RANK[minimum]


def _check(given: str | None, expected: str | None, role: str, setting: str) -> None:
    if not expected:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, f"{role} API is switched off. Set {setting} in .env."
        )
    # compare_digest takes the same time for any wrong key, so the key cannot be guessed by timing.
    if given is None or not compare_digest(given.encode(), expected.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Missing or wrong {role.lower()} key")
