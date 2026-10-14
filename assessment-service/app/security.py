"""Who may use the staff endpoints, and (from app/services/auth.py) who is signed in.

Staff routes need a real account of the right role now (see require_role and
app/models/users.py) - the shared ADMIN_API_KEY / TEACHER_API_KEY header this
project used before real accounts existed has been removed. The very first admin
is made by app/create_admin.py, run once from the command line, never over HTTP.

/integration is a different concern from either of those: the caller is another
team member's service (see require_integration_caller, below), which has no user
account here to log in with, so it is the one place a static shared key is still
the right tool.
"""

from secrets import compare_digest

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import User, UserRole
from app.services.auth import ROLE_RANK, decode_token

_bearer = HTTPBearer(auto_error=False, description="Access token from POST /auth/login")
_integration_key_header = APIKeyHeader(
    name="X-Integration-Key", auto_error=False, description="One of the INTEGRATION_KEY_COMPONENT* values"
)


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


# The staff routes - a real account of the right role, nothing else.
require_admin = require_role(UserRole.ADMIN)
require_teacher = require_role(UserRole.TEACHER)


# /integration - another team member's service, not a person (see module docstring)


def require_integration_caller(
    key: str | None = Security(_integration_key_header),
    settings: Settings = Depends(get_settings),
) -> str:
    """Which component is calling ("component1" / "component3" / "component4"),
    checked against that component's own configured key - a wrong key is 401, and
    having no integration keys configured at all is 503, same convention the old
    admin/teacher key checks used."""
    configured = {
        "component1": settings.integration_key_component1,
        "component3": settings.integration_key_component3,
        "component4": settings.integration_key_component4,
    }
    if not any(configured.values()):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The integration API is switched off. Set an INTEGRATION_KEY_COMPONENT* in .env.",
        )
    for caller, expected in configured.items():
        if expected and key and compare_digest(key.encode(), expected.encode()):
            return caller
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or wrong integration key")
