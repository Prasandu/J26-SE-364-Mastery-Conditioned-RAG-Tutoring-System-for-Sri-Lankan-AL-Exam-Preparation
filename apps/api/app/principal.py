"""Principal (owner) resolution.

Owner IDs are never taken from request bodies or custom headers. The development principal is
refused outside development (see ``Settings.validate_for_startup``). ``supabase_jwt`` verifies the
integrated app's Supabase Auth access token against the project's public signing keys (JWKS) and
uses its ``sub`` (``auth.uid()``) as the owner, the same identity the other three components use.
"""

from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol
from uuid import UUID

import jwt
from fastapi import Request

from app.errors import ApiError

SUPABASE_ALGORITHMS = ["ES256", "RS256"]

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


@lru_cache(maxsize=4)
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True)


class SupabaseJwtPrincipalProvider:
    """A signed-in Supabase user: ``Authorization: Bearer <access token>``.

    The signature (ES256/RS256 key from JWKS), audience, expiry and ``sub`` are required;
    ``sub`` must be a UUID because lab owner columns are UUIDs (``auth.uid()``). A missing or
    invalid token is 401 ``unauthenticated``; JWKS being unreachable is 503, so a network
    fault never looks like a bad sign-in. Fails closed when no JWKS URL is configured.
    """

    def __init__(self, jwks_url: str | None, audience: str = "authenticated") -> None:
        self._jwks_url = jwks_url
        self._audience = audience

    def __call__(self, request: Request) -> Principal:
        if not self._jwks_url:
            raise ApiError(503, "auth_not_configured", "Authentication is not configured")
        header = request.headers.get("authorization", "")
        scheme, _, token = header.partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            raise ApiError(401, "unauthenticated", "Sign in to continue")
        try:
            key = _jwks_client(self._jwks_url).get_signing_key_from_jwt(token.strip()).key
            claims = jwt.decode(
                token.strip(),
                key,
                algorithms=SUPABASE_ALGORITHMS,
                audience=self._audience,
                options={"require": ["exp", "sub", "aud"]},
            )
        except jwt.PyJWKClientError as error:
            raise ApiError(
                503, "auth_not_configured", "Sign-in could not be checked right now", retryable=True
            ) from error
        except jwt.InvalidTokenError as error:
            raise ApiError(401, "unauthenticated", "Sign in to continue") from error
        try:
            owner = str(UUID(str(claims["sub"])))
        except ValueError as error:
            raise ApiError(401, "unauthenticated", "Sign in to continue") from error
        return Principal(owner)


def build_principal_provider(
    kind: str, jwks_url: str | None = None, audience: str = "authenticated"
) -> PrincipalProvider:
    if kind == "development":
        return FixedPrincipalProvider(DEVELOPMENT_PRINCIPAL_ID)
    if kind == "test":
        return FixedPrincipalProvider(TEST_PRINCIPAL_ID)
    return SupabaseJwtPrincipalProvider(jwks_url, audience)
