"""Who may use the staff endpoints.

Shared keys in a header, one role per key. This is a stop-gap until the team's
shared login (Supabase Auth) gives us real user accounts.
"""

from secrets import compare_digest

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader

from app.config import Settings, get_settings

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
