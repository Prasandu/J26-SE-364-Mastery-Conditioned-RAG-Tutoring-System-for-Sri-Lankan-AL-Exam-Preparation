from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.config import settings
from app.security import get_student_id, require_api_key

app = FastAPI()


@app.get("/student")
def student_endpoint(student_id: Annotated[str, Depends(get_student_id)]) -> dict[str, str]:
    return {"student_id": student_id}


@app.post("/ingest", dependencies=[Depends(require_api_key)])
def ingest_endpoint() -> dict[str, bool]:
    return {"accepted": True}


client = TestClient(app)


def test_student_endpoint_accepts_valid_supabase_token(monkeypatch) -> None:
    monkeypatch.setattr(settings, "supabase_jwks_url", "")
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_jwt_secret", "test-jwt-secret-at-least-32-bytes")
    token = jwt.encode(
        {
            "sub": "student-123",
            "aud": "authenticated",
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        "test-jwt-secret-at-least-32-bytes",
        algorithm="HS256",
    )

    response = client.get("/student", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {"student_id": "student-123"}


def test_student_endpoint_prefers_supabase_jwks(monkeypatch) -> None:
    class FakeSigningKey:
        key = "verified-public-key"

    class FakeJwksClient:
        def get_signing_key_from_jwt(self, token: str) -> FakeSigningKey:
            assert token == "jwks-token"
            return FakeSigningKey()

    decode_arguments = {}

    def fake_decode(token: str, key: str, **kwargs) -> dict[str, str]:
        decode_arguments.update(token=token, key=key, **kwargs)
        return {"sub": "student-jwks", "aud": "authenticated"}

    monkeypatch.setattr(settings, "supabase_jwks_url", "https://example.supabase.co/jwks.json")
    monkeypatch.setattr(settings, "supabase_jwt_secret", "legacy-secret")
    monkeypatch.setattr("app.security._get_jwks_client", lambda url: FakeJwksClient())
    monkeypatch.setattr("app.security.jwt.decode", fake_decode)

    response = client.get("/student", headers={"Authorization": "Bearer jwks-token"})

    assert response.status_code == 200
    assert response.json() == {"student_id": "student-jwks"}
    assert decode_arguments == {
        "token": "jwks-token",
        "key": "verified-public-key",
        "algorithms": ["ES256", "RS256"],
        "audience": "authenticated",
        "options": {"require": ["exp", "sub", "aud"]},
    }


def test_jwks_url_is_derived_from_supabase_url(monkeypatch) -> None:
    monkeypatch.setattr(settings, "supabase_jwks_url", "")
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co/")

    from app.security import _jwks_url

    assert _jwks_url() == "https://example.supabase.co/auth/v1/.well-known/jwks.json"


def test_student_endpoint_reports_missing_jwt_configuration(monkeypatch) -> None:
    monkeypatch.setattr(settings, "supabase_jwks_url", "")
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")

    response = client.get("/student", headers={"Authorization": "Bearer token"})

    assert response.status_code == 503
    assert response.json()["detail"] == "Supabase JWT verification is not configured."


def test_student_endpoint_rejects_invalid_token() -> None:
    response = client.get("/student", headers={"Authorization": "Bearer invalid"})

    assert response.status_code == 401


def test_ingestion_endpoint_requires_api_key_header() -> None:
    denied = client.post("/ingest")
    accepted = client.post(
        "/ingest",
        headers={"X-API-Key": settings.ingest_api_key},
    )

    assert denied.status_code == 401
    assert accepted.status_code == 200
