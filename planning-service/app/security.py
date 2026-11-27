import hmac
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class StudentIdentity:
    student_id: str
    first_name: str


def _jwks_url() -> str:
    if settings.supabase_jwks_url:
        return settings.supabase_jwks_url
    if settings.supabase_url:
        return f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return ""


@lru_cache(maxsize=4)
def _get_jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True)


def decode_supabase_token(token: str) -> dict:
    jwks_url = _jwks_url()
    if jwks_url:
        signing_key = _get_jwks_client(jwks_url).get_signing_key_from_jwt(token).key
        return jwt.decode(
            token,
            signing_key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            options={"require": ["exp", "sub", "aud"]},
        )
    if settings.supabase_jwt_secret:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
            options={"require": ["exp", "sub", "aud"]},
        )
    raise RuntimeError("Supabase JWT verification is not configured.")


def get_student_id(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
) -> str:
    return _student_identity_from_credentials(credentials).student_id


def get_student_identity(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
) -> StudentIdentity:
    return _student_identity_from_credentials(credentials)


def _student_identity_from_credentials(
    credentials: HTTPAuthorizationCredentials | None,
) -> StudentIdentity:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        claims = decode_supabase_token(credentials.credentials)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except jwt.PyJWKClientConnectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not retrieve Supabase signing keys.",
        ) from exc
    except jwt.PyJWKClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    student_id = claims.get("sub")
    if not isinstance(student_id, str) or not student_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token does not identify a student.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    metadata = claims.get("user_metadata")
    display_name = ""
    if isinstance(metadata, dict):
        display_name = next(
            (
                value.strip()
                for key in ("display_name", "full_name", "name")
                if isinstance((value := metadata.get(key)), str) and value.strip()
            ),
            "",
        )
    if display_name:
        first_name = display_name.split()[0]
    else:
        email = claims.get("email")
        prefix = email.partition("@")[0] if isinstance(email, str) else ""
        first_name = prefix.capitalize() if prefix else "there"
    return StudentIdentity(student_id=student_id, first_name=first_name)


def _presented_keys(*keys: str | None) -> list[str]:
    return [key for key in keys if key]


def _matches(presented: list[str], expected: str) -> bool:
    return bool(expected) and any(hmac.compare_digest(key.encode(), expected.encode()) for key in presented)


def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    x_integration_key: str | None = Header(default=None, alias="X-Integration-Key"),
) -> None:
    """Operator-only routes (the finalized-mark pull, quarantine, demo): INGEST_API_KEY, on
    X-Integration-Key or the older X-API-Key. A component's own key is not enough."""
    if not settings.ingest_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ingestion API key is not configured.",
        )
    if not _matches(_presented_keys(x_integration_key, x_api_key), settings.ingest_api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
        )


def require_service_caller(
    x_integration_key: str | None = Header(default=None, alias="X-Integration-Key"),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> str:
    """SEC-008: which machine caller this is - "component1" (lab), "component2"
    (assessment), "component4" (tutor) by their own keys, or "operator" by INGEST_API_KEY.
    Wrong or missing key 401; nothing configured 503. Never a student's token."""
    configured = {
        "component1": settings.integration_key_component1,
        "component2": settings.integration_key_component2,
        "component4": settings.integration_key_component4,
        "operator": settings.ingest_api_key,
    }
    if not any(configured.values()):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No integration key is configured.",
        )
    presented = _presented_keys(x_integration_key, x_api_key)
    for caller, expected in configured.items():
        if _matches(presented, expected):
            return caller
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing integration key.",
    )


def require_demo_mode() -> None:
    if not settings.demo_mode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
