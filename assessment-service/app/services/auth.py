"""Registering, logging in, and the tokens that prove who is making a request.

A role is a tier, not an independent permission set - ROLE_RANK is the single place
that decides "teacher can do everything a student can", so app/security.py never has
to repeat that logic per route.

Login never says which part was wrong (unknown email vs right email, wrong password):
the same "wrong email or password" either way, so a caller cannot use the error to
find out which email addresses have an account.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.errors import ConflictError
from app.models import User, UserRole
from app.schemas.auth import AdminUserCreateIn, ChangePasswordIn, ProfileUpdateIn, RegisterIn

ROLE_RANK = {UserRole.STUDENT: 0, UserRole.TEACHER: 1, UserRole.ADMIN: 2}

WRONG_CREDENTIALS = "Wrong email or password"

# bcrypt's cost factor: deliberately slow, so a stolen hash is expensive to brute
# force. tests/conftest.py lowers this for the test process only (many tests log a
# user in, and 12 rounds would add real minutes to the suite) - production always
# uses this default.
BCRYPT_ROUNDS = 12


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(BCRYPT_ROUNDS)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


@dataclass(frozen=True)
class TokenPayload:
    user_id: int
    role: UserRole


def create_token(user: User, settings: Settings) -> str:
    if not settings.jwt_secret:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Login is switched off. Set JWT_SECRET in .env."
        )
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.jwt_expires_minutes)
    payload = {"sub": str(user.id), "role": user.role.value, "exp": expires_at}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str, settings: Settings) -> TokenPayload:
    if not settings.jwt_secret:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Login is switched off. Set JWT_SECRET in .env."
        )
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        return TokenPayload(user_id=int(payload["sub"]), role=UserRole(payload["role"]))
    except (jwt.InvalidTokenError, KeyError, ValueError) as error:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Session expired or invalid, please log in again"
        ) from error

def register_user(db: Session, data: RegisterIn) -> User:
    """A public signup always creates a student - see app/models/users.py for why."""
    email = normalize_email(data.email)
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise ConflictError("An account with that email already exists")

    user = User(
        email=email,
        name=data.name.strip(),
        password_hash=hash_password(data.password),
        role=UserRole.STUDENT,
    )
    db.add(user)
    db.commit()
    return user


def create_admin_user(db: Session, data: AdminUserCreateIn) -> User:
    email = normalize_email(data.email)
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise ConflictError("An account with that email already exists")

    user = User(
        email=email,
        name=data.name.strip(),
        password_hash=hash_password(data.password),
        role=data.role,
    )
    db.add(user)
    db.commit()
    return user


def authenticate_user(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == normalize_email(email)))
    if user is None or not user.is_active or not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, WRONG_CREDENTIALS)
    return user


def update_profile(db: Session, user: User, data: ProfileUpdateIn) -> User:
    """Just the name - see ProfileUpdateIn for why email and role are not here."""
    user.name = data.name.strip()
    db.commit()
    return user


def change_password(db: Session, user: User, data: ChangePasswordIn) -> None:
    """The current password is required even though the caller is already signed
    in: the token alone is not proof the person at the keyboard is still the
    account owner (a shared computer, a left-open tab)."""
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is wrong")
    user.password_hash = hash_password(data.new_password)
    db.commit()
