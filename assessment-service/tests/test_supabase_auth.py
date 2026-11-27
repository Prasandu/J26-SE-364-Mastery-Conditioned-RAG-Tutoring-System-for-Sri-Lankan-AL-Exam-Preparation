"""The shared Supabase Auth sign-in (app/services/supabase_auth.py).

Self-contained: a local EC key stands in for Supabase's JWKS, and a throwaway SQLite
database holds the users table, so these run without the network or a .env.
"""

import os
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "sqlite://")

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import Settings
from app.db import Base
from app.models import User, UserRole
from app.security import current_user
from app.services import integration, supabase_auth
from app.services.auth import authenticate_user, create_token

SUPABASE_ID = "6f1c0d2e-8b3a-4c5d-9e7f-0a1b2c3d4e5f"
PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())


@pytest.fixture
def settings() -> Settings:
    return Settings(
        _env_file=None,  # independent of the developer's .env
        database_url="sqlite://",
        jwt_secret="x" * 40,
        supabase_url="https://example-project.supabase.co",
    )


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[User.__table__])
    with Session(engine) as session:
        yield session


@pytest.fixture(autouse=True)
def fake_jwks(monkeypatch: pytest.MonkeyPatch) -> None:
    client = SimpleNamespace(
        get_signing_key_from_jwt=lambda _token: SimpleNamespace(key=PRIVATE_KEY.public_key())
    )
    monkeypatch.setattr(supabase_auth, "_jwks_client", lambda _url: client)


def supabase_token(**overrides) -> str:
    claims = {
        "sub": SUPABASE_ID,
        "aud": "authenticated",
        "exp": datetime.now(UTC) + timedelta(hours=1),
        "email": "Student@School.lk",
        "user_metadata": {"name": "Nimali Perera"},
    }
    claims.update(overrides)
    return jwt.encode(claims, PRIVATE_KEY, algorithm="ES256", headers={"kid": "test-key"})


def bearer(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_first_supabase_sign_in_makes_a_linked_student(db, settings):
    user = current_user(bearer(supabase_token()), settings, db)

    assert user.role == UserRole.STUDENT
    assert user.email == "student@school.lk"
    assert user.name == "Nimali Perera"
    assert user.supabase_user_id == SUPABASE_ID
    assert user.password_hash == ""


def test_later_sign_ins_reuse_the_account_and_its_role(db, settings):
    first = current_user(bearer(supabase_token()), settings, db)
    first.role = UserRole.TEACHER
    db.commit()

    again = current_user(bearer(supabase_token()), settings, db)

    assert again.id == first.id
    assert again.role == UserRole.TEACHER
    assert db.scalar(select(User).where(User.email == "student@school.lk")) is not None
    assert len(db.scalars(select(User)).all()) == 1


def test_never_links_to_an_existing_local_account_by_email(db, settings):
    db.add(User(email="student@school.lk", name="Admin", password_hash="h", role=UserRole.ADMIN))
    db.commit()

    with pytest.raises(HTTPException) as error:
        current_user(bearer(supabase_token()), settings, db)

    assert error.value.status_code == 409
    admin = db.scalar(select(User).where(User.email == "student@school.lk"))
    assert admin.supabase_user_id is None


@pytest.mark.parametrize(
    "overrides",
    [
        {"exp": datetime.now(UTC) - timedelta(minutes=1)},
        {"aud": "anon"},
        {"email": ""},
    ],
    ids=["expired", "wrong-audience", "no-email"],
)
def test_rejects_bad_supabase_tokens(db, settings, overrides):
    with pytest.raises(HTTPException) as error:
        current_user(bearer(supabase_token(**overrides)), settings, db)

    assert error.value.status_code == 401


def test_rejects_a_token_signed_by_another_key(db, settings):
    other = ec.generate_private_key(ec.SECP256R1())
    forged = jwt.encode(
        {
            "sub": SUPABASE_ID,
            "aud": "authenticated",
            "exp": datetime.now(UTC) + timedelta(hours=1),
            "email": "x@y.lk",
        },
        other,
        algorithm="ES256",
    )

    with pytest.raises(HTTPException) as error:
        current_user(bearer(forged), settings, db)

    assert error.value.status_code == 401


def test_supabase_tokens_are_refused_when_supabase_is_not_configured(db):
    local_only = Settings(_env_file=None, database_url="sqlite://", jwt_secret="x" * 40)

    with pytest.raises(HTTPException) as error:
        current_user(bearer(supabase_token()), local_only, db)

    assert error.value.status_code == 401


def test_own_tokens_still_work(db, settings):
    local = User(email="teacher@school.lk", name="T", password_hash="h", role=UserRole.TEACHER)
    db.add(local)
    db.commit()

    assert current_user(bearer(create_token(local, settings)), settings, db).id == local.id


def test_supabase_only_account_cannot_password_login(db, settings):
    current_user(bearer(supabase_token()), settings, db)

    with pytest.raises(HTTPException) as error:
        authenticate_user(db, "student@school.lk", "anything")

    assert error.value.status_code == 401


def test_integration_resolves_a_supabase_user_id_to_the_account(db, settings):
    current_user(bearer(supabase_token()), settings, db)

    assert integration.resolve_student_ref(db, SUPABASE_ID) == "student@school.lk"
    assert integration.resolve_student_ref(db, "someone@else.lk") == "someone@else.lk"
