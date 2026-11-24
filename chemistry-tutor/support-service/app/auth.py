from functools import lru_cache

import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient

from app.config import settings


@lru_cache(maxsize=1)
def _get_jwks_client() -> PyJWKClient:
    # Supabase's public signing keys — verifying against these needs no
    # shared secret in our own config, and works for any backend that
    # knows the project URL (useful once other components need to verify
    # the same tokens too).
    jwks_url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    return PyJWKClient(jwks_url)


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency: verify a Supabase Auth JWT from the
    Authorization header and return the authenticated user's id (the
    `sub` claim — a UUID string).
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience="authenticated",
            options={"require": ["sub", "exp"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc

    return payload["sub"]


def require_self(student_id: str, current_user_id: str) -> None:
    """Call at the top of a route body (after depending on
    get_current_user_id) to enforce that the authenticated user is only
    acting on their own data. Raises HTTPException(403) on mismatch.
    """
    if student_id != current_user_id:
        raise HTTPException(status_code=403, detail="Cannot access another student's data")
