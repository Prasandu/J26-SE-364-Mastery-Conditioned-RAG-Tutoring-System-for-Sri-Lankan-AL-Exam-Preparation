"""Register, log in, and promote an account's role (admin only)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.errors import NotFoundError
from app.models import User, UserRole
from app.schemas.auth import LoginIn, RegisterIn, TokenOut, UserOut
from app.security import current_user, require_role
from app.services.auth import authenticate_user, create_token, register_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    """Always creates a student account - see app/models/users.py for why."""
    return register_user(db, data)


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    user = authenticate_user(db, data.email, data.password)
    return TokenOut(access_token=create_token(user, settings), role=user.role)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    """Who the current token belongs to - the frontend uses this to restore a session."""
    return user


@router.post("/users/{user_id}/role", response_model=UserOut)
def set_role(
    user_id: int,
    role: UserRole,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role(UserRole.ADMIN)),  # noqa: B008 - FastAPI's own pattern for a parametrized dependency
):
    """Promote (or demote) an existing account. The only way to create a teacher or
    admin account short of app/create_admin.py - nobody can grant it to themselves."""
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("No user with that id")
    user.role = role
    db.commit()
    return user
