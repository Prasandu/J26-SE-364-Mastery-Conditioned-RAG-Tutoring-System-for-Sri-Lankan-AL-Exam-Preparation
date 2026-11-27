"""SEC-005: every /attempts/{attempt_id}/... route is owner-only.

Before this, only POST /attempts and GET /attempts required a sign-in; reading,
answering, uploading photos for and submitting an attempt needed nothing but its id.

Self-contained (throwaway SQLite, no network): the guard is tested directly, and the
route table is checked from the source, so a new attempt route added without the
guard fails here instead of shipping unprotected.
"""

import ast
import os
import uuid
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite://")

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import Attempt, AttemptMode, User, UserRole
from app.security import require_owned_attempt

ATTEMPTS_API = Path(__file__).resolve().parents[1] / "app" / "api" / "attempts.py"


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[User.__table__, Attempt.__table__])
    with Session(engine) as session:
        yield session


def make_user(db: Session, email: str, role: UserRole = UserRole.STUDENT) -> User:
    user = User(email=email, name=email.split("@")[0], password_hash="h", role=role)
    db.add(user)
    db.commit()
    return user


def make_attempt(db: Session, owner: User) -> Attempt:
    attempt = Attempt(
        paper_id=1, scheme_id=1, student_ref=owner.email, mode=next(iter(AttemptMode)), max_score=10
    )
    db.add(attempt)
    db.commit()
    return attempt


def test_owner_may_use_their_attempt(db):
    owner = make_user(db, "owner@school.lk")
    attempt = make_attempt(db, owner)

    assert require_owned_attempt(attempt.id, owner, db) == attempt.id


@pytest.mark.parametrize("role", [UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN])
def test_nobody_else_may_use_it_whatever_their_role(db, role):
    owner = make_user(db, "owner@school.lk")
    attempt = make_attempt(db, owner)
    other = make_user(db, f"other-{role.value}@school.lk", role)

    with pytest.raises(HTTPException) as error:
        require_owned_attempt(attempt.id, other, db)

    # 404, not 403: a guessed id must not reveal that the attempt exists.
    assert error.value.status_code == 404


def test_a_missing_attempt_is_404_too(db):
    owner = make_user(db, "owner@school.lk")

    with pytest.raises(HTTPException) as error:
        require_owned_attempt(uuid.uuid4(), owner, db)

    assert error.value.status_code == 404


def _routes() -> list[tuple[str, str, str]]:
    """(path, decorator source, function source) for every @router.<method>(...) in
    app/api/attempts.py. The function's own segment excludes its decorators."""
    source = ATTEMPTS_API.read_text(encoding="utf-8")
    routes = []
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            if (
                isinstance(decorator, ast.Call)
                and isinstance(decorator.func, ast.Attribute)
                and isinstance(decorator.func.value, ast.Name)
                and decorator.func.value.id == "router"
            ):
                path = decorator.args[0].value
                routes.append(
                    (path, ast.get_source_segment(source, decorator), ast.get_source_segment(source, node))
                )
    return routes


def test_every_route_on_one_attempt_is_owner_only():
    per_attempt = [(path, decorator) for path, decorator, _ in _routes() if "{attempt_id}" in path]

    assert len(per_attempt) >= 7  # get, save, clear, image, sheet, bulk save, submit
    unguarded = [path for path, decorator in per_attempt if "dependencies=OWNER_ONLY" not in decorator]
    assert unguarded == []


def test_every_other_attempt_route_needs_a_signed_in_student():
    others = [(path, function) for path, _, function in _routes() if "{attempt_id}" not in path]

    assert others  # POST /attempts and GET /attempts
    unguarded = [path for path, function in others if "require_role(UserRole.STUDENT)" not in function]
    assert unguarded == []
