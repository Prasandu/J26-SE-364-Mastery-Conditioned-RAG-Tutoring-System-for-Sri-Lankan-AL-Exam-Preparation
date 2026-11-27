"""LAB-018: LAB_PRINCIPAL_PROVIDER=supabase_jwt - the shared Supabase sign-in.

A local EC key stands in for the project's JWKS, so nothing here touches the network.
Covers R04 (missing/expired/forged/other-audience tokens are refused) and R02 (one
signed-in student cannot read or act on another's session).
"""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app import principal as principal_module
from app.settings import ConfigurationError
from tests.conftest import build_app, make_settings, start

KEY = ec.generate_private_key(ec.SECP256R1())
OTHER_KEY = ec.generate_private_key(ec.SECP256R1())
USER_A = "6f1c0d2e-8b3a-4c5d-9e7f-0a1b2c3d4e5f"
USER_B = "7a2d1e3f-9c4b-4d6e-8f70-1b2c3d4e5f60"


@pytest.fixture(autouse=True)
def fake_jwks(monkeypatch: pytest.MonkeyPatch) -> None:
    client = SimpleNamespace(
        get_signing_key_from_jwt=lambda _token: SimpleNamespace(key=KEY.public_key())
    )
    monkeypatch.setattr(principal_module, "_jwks_client", lambda _url: client)


def token(sub: str = USER_A, key: Any = KEY, **claims: Any) -> str:
    body = {
        "sub": sub,
        "aud": "authenticated",
        "exp": datetime.now(UTC) + timedelta(hours=1),
        **claims,
    }
    return jwt.encode(body, key, algorithm="ES256", headers={"kid": "test"})


@pytest.fixture
def client() -> Any:
    settings = make_settings(
        principal_provider="supabase_jwt", supabase_url="https://example.supabase.co"
    )
    with TestClient(build_app(settings)) as c:
        yield c


def as_user(client: TestClient, bearer: str | None) -> TestClient:
    client.headers.pop("Authorization", None)
    if bearer is not None:
        client.headers["Authorization"] = f"Bearer {bearer}"
    return client


def test_a_signed_in_student_can_start_and_read_their_session(client: TestClient) -> None:
    as_user(client, token(USER_A))
    sid = start(client)["session"]["sessionId"]

    assert client.get(f"/sessions/{sid}").status_code == 200


@pytest.mark.parametrize(
    "bearer",
    [
        None,
        "not-a-jwt",
        token(exp=datetime.now(UTC) - timedelta(minutes=1)),
        token(aud="anon"),
        token(key=OTHER_KEY),
        token(sub="not-a-uuid"),
    ],
    ids=["missing", "garbage", "expired", "wrong-audience", "forged-signature", "non-uuid-sub"],
)
def test_bad_or_missing_tokens_are_refused(client: TestClient, bearer: str | None) -> None:
    response = as_user(client, bearer).get("/sessions/00000000-0000-4000-8000-000000000001")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthenticated"


def test_one_student_cannot_see_or_act_on_anothers_session(client: TestClient) -> None:
    sid = start(as_user(client, token(USER_A)))["session"]["sessionId"]

    as_user(client, token(USER_B))
    assert client.get(f"/sessions/{sid}").status_code == 404
    assert client.get(f"/sessions/{sid}/report").status_code == 404


def test_supabase_jwt_without_a_jwks_url_is_refused_at_startup() -> None:
    with pytest.raises(ConfigurationError, match="LAB_SUPABASE"):
        make_settings(principal_provider="supabase_jwt").validate_for_startup()


def test_production_accepts_supabase_jwt_with_a_jwks_url() -> None:
    settings = make_settings(
        environment="production",
        principal_provider="supabase_jwt",
        supabase_jwks_url="https://example.supabase.co/auth/v1/.well-known/jwks.json",
        fixed_seed=None,
    )
    assert settings.jwks_url and settings.principal_provider == "supabase_jwt"


def test_cors_allows_the_authorization_header(client: TestClient) -> None:
    preflight = client.options(
        "/sessions",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert preflight.status_code == 200
    assert "authorization" in preflight.headers["access-control-allow-headers"].lower()
