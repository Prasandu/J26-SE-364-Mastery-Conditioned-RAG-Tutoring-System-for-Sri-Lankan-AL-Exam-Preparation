"""Signing in with the Supabase Auth account shared by all four components.

The integrated web app (frontend/) signs everyone in with Supabase Auth, the same
identity the planning and support services already verify. This service accepts
those access tokens next to its own HS256 tokens (app/services/auth.py):

- Supabase signs with an asymmetric key (ES256/RS256) published at its JWKS URL, so
  verifying needs no shared secret here - the same way planning-service does it.
- The token's `sub` (a UUID) is looked up in users.supabase_user_id. The first time a
  Supabase user calls this service, a STUDENT account is made for them.
- Never linked by email to an existing local account: whether Supabase confirmed the
  address is not in the token, so linking by email would let anyone who registers an
  admin's address in Supabase inherit that admin's role. A role is only ever raised
  by an admin, or from the command line (app/set_role.py).
"""

from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import User, UserRole
from app.services.auth import normalize_email

SUPABASE_ALGORITHMS = ["ES256", "RS256"]
INVALID = "Session expired or invalid, please log in again"


@dataclass(frozen=True)
class SupabaseIdentity:
    user_id: str  # the token's `sub`
    email: str
    name: str


def jwks_url(settings: Settings) -> str | None:
    if settings.supabase_jwks_url:
        return settings.supabase_jwks_url
    if settings.supabase_url:
        return f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return None


@lru_cache(maxsize=4)
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True)


def is_supabase_token(token: str, settings: Settings) -> bool:
    """True for a token this service should verify against Supabase: one signed with
    an asymmetric algorithm, when Supabase is configured. This service's own tokens
    are always HS256, so the header alone tells them apart."""
    if jwks_url(settings) is None:
        return False
    try:
        return jwt.get_unverified_header(token).get("alg") in SUPABASE_ALGORITHMS
    except jwt.InvalidTokenError:
        return False


def decode_supabase_token(token: str, settings: Settings) -> SupabaseIdentity:
    url = jwks_url(settings)
    if url is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID)
    try:
        signing_key = _jwks_client(url).get_signing_key_from_jwt(token).key
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=SUPABASE_ALGORITHMS,
            audience="authenticated",
            options={"require": ["exp", "sub", "aud"]},
        )
    except jwt.PyJWKClientError as error:
        # The JWKS endpoint could not be read (network, paused project): not the
        # caller's fault, so not a 401 that would sign them out.
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Could not reach Supabase Auth to check the sign-in"
        ) from error
    except jwt.InvalidTokenError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID) from error

    email = payload.get("email")
    if not isinstance(email, str) or not email.strip():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This sign-in has no email address")
    metadata = payload.get("user_metadata") if isinstance(payload.get("user_metadata"), dict) else {}
    name = next(
        (
            str(metadata[key]).strip()
            for key in ("name", "full_name", "first_name")
            if isinstance(metadata.get(key), str) and metadata[key].strip()
        ),
        email.split("@", 1)[0],
    )
    return SupabaseIdentity(user_id=str(payload["sub"]), email=normalize_email(email), name=name[:100])


def user_for_supabase_identity(db: Session, identity: SupabaseIdentity) -> User:
    """The account linked to this Supabase user, made as a STUDENT on first use."""
    user = db.scalar(select(User).where(User.supabase_user_id == identity.user_id))
    if user is not None:
        return user

    if db.scalar(select(User).where(User.email == identity.email)) is not None:
        # See the module docstring for why this is not linked automatically.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "An assessment account with this email already exists. Ask an admin to link it "
            "(python -m app.set_role --link).",
        )

    user = User(
        email=identity.email,
        name=identity.name,
        password_hash="",  # Supabase-only: authenticate_user refuses a password login
        supabase_user_id=identity.user_id,
        role=UserRole.STUDENT,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Two first requests raced to create the same account; use the winner's.
        db.rollback()
        user = db.scalar(select(User).where(User.supabase_user_id == identity.user_id))
        if user is None:
            raise
    return user
