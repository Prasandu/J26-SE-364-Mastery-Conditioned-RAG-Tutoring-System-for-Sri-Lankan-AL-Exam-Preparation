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


def test_student_endpoint_accepts_valid_supabase_token() -> None:
    token = jwt.encode(
        {
            "sub": "student-123",
            "aud": "authenticated",
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )

    response = client.get("/student", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {"student_id": "student-123"}


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
