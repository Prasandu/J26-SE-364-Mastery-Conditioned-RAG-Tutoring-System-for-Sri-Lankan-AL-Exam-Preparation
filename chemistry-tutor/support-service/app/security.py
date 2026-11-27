"""Service-to-service access and development-only switches.

End users are authenticated by app.auth (Supabase Auth JWT). This module covers the
callers that are NOT a signed-in student:

- require_integration_caller: another component's service writing into this one
  (machine ingestion such as POST /practice/flagged-questions). It authenticates with
  its own X-Integration-Key - the same scheme as assessment-service's /integration
  API - and an end-user token is never accepted in its place, so a student cannot
  create records "on behalf of" another student.
- require_raw_tutor_enabled: gate for the ungrounded /tutor/ask-raw comparison route.
"""

from secrets import compare_digest

from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader

from app.config import settings

_integration_key_header = APIKeyHeader(
    name="X-Integration-Key", auto_error=False, description="A calling component's integration key"
)


def require_integration_caller(key: str | None = Security(_integration_key_header)) -> str:
    """Which component is calling. 503 if no integration key is configured at all (the
    route is switched off), 401 for a missing or wrong key."""
    configured = {"component2": settings.integration_key_component2}
    if not any(configured.values()):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Machine ingestion is switched off. Set INTEGRATION_KEY_COMPONENT2 in .env.",
        )
    for caller, expected in configured.items():
        if expected and key and compare_digest(key.encode(), expected.encode()):
            return caller
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or wrong integration key")


def require_raw_tutor_enabled() -> None:
    """404 - as if the route did not exist - unless ENABLE_RAW_TUTOR=true. The setting
    itself cannot be true in production (app.config refuses to start)."""
    if not settings.enable_raw_tutor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")
