"""Principal (owner) resolution. M1 has no real authentication.

Owner IDs are never taken from request bodies or headers. The development principal is refused
outside development (see ``Settings.validate_for_startup``); the Supabase/JWT provider is a
placeholder that fails closed. **Do not deploy the API publicly before real authentication exists.**
"""

from dataclasses import dataclass
from typing import Protocol

from fastapi import Request

from app.errors import ApiError

DEVELOPMENT_PRINCIPAL_ID = "00000000-0000-4000-8000-000000000001"
TEST_PRINCIPAL_ID = "00000000-0000-4000-8000-0000000000aa"


@dataclass(frozen=True)
class Principal:
    id: str


class PrincipalProvider(Protocol):
    def __call__(self, request: Request) -> Principal: ...


class FixedPrincipalProvider:
    """Development/test only: every request acts as one fixed local learner."""

    def __init__(self, principal_id: str) -> None:
        self._principal = Principal(principal_id)

    def __call__(self, request: Request) -> Principal:
        return self._principal


class SupabaseJwtPrincipalProvider:
    """Future: verify a Supabase JWT and use its ``sub`` (auth.uid()). Fails closed for now."""

    def __call__(self, request: Request) -> Principal:
        raise ApiError(503, "auth_not_configured", "Authentication is not configured")


def build_principal_provider(kind: str) -> PrincipalProvider:
    if kind == "development":
        return FixedPrincipalProvider(DEVELOPMENT_PRINCIPAL_ID)
    if kind == "test":
        return FixedPrincipalProvider(TEST_PRINCIPAL_ID)
    return SupabaseJwtPrincipalProvider()
