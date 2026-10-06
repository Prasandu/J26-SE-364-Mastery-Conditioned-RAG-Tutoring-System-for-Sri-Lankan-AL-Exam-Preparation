"""Admin access check.

A shared key in the X-Admin-Key header. This is a stop-gap until the team's shared
login (Supabase Auth) gives us real admin users.
"""

from secrets import compare_digest

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader

from app.config import Settings, get_settings

_admin_key_header = APIKeyHeader(
    name="X-Admin-Key", auto_error=False, description="Value of ADMIN_API_KEY in .env"
)


def require_admin(
    key: str | None = Security(_admin_key_header), settings: Settings = Depends(get_settings)
) -> None:
    if not settings.admin_api_key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Admin API is switched off. Set ADMIN_API_KEY in .env."
        )
    # compare_digest takes the same time for any wrong key, so the key cannot be guessed by timing.
    if key is None or not compare_digest(key.encode(), settings.admin_api_key.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or wrong admin key")
