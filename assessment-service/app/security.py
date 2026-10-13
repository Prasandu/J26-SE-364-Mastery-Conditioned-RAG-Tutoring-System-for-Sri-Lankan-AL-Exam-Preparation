"""Who may use the staff endpoints, and (from app/services/auth.py) who is signed in.

Two systems exist side by side during the move to real accounts: shared keys in a
header (require_admin, require_teacher - the original stop-gap), and now real login
(require_role, current_user). A route is switched over to require_role in its own
stage rather than all at once, so the app is never broken mid-migration - see the
docstring in app/models/users.py.
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


def require_admin(
    key: str | None = Security(_admin_key_header), settings: Settings = Depends(get_settings)
) -> None:
    _check(key, settings.admin_api_key, "Admin", "ADMIN_API_KEY")


def require_teacher(
    key: str | None = Security(_teacher_key_header), settings: Settings = Depends(get_settings)
) -> None:
    _check(key, settings.teacher_api_key, "Teacher review", "TEACHER_API_KEY")


def _check(given: str | None, expected: str | None, role: str, setting: str) -> None:
    if not expected:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, f"{role} API is switched off. Set {setting} in .env."
        )
    # compare_digest takes the same time for any wrong key, so the key cannot be guessed by timing.
    if given is None or not compare_digest(given.encode(), expected.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Missing or wrong {role.lower()} key")


# Real login (see app/services/auth.py)

_bearer = HTTPBearer(auto_error=False, description="Access token from POST /auth/login")


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
