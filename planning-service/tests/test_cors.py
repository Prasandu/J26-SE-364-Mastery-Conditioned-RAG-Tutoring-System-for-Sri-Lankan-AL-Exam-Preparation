from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app


def test_cors_origins_are_configurable_as_a_comma_separated_list() -> None:
    settings = Settings(
        database_url="postgresql+psycopg://x:y@localhost/db",
        ingest_api_key="key",
        cors_origins=" http://localhost:5173 , https://alstudyhub.example.lk/ ,",
    )

    assert settings.allowed_cors_origins == ["http://localhost:5173", "https://alstudyhub.example.lk"]


def test_default_frontend_origin_is_allowed_and_others_are_not() -> None:
    client = TestClient(app)
    preflight = {"Access-Control-Request-Method": "GET"}

    allowed = client.options("/health", headers={"Origin": "http://localhost:5173", **preflight})
    blocked = client.options("/health", headers={"Origin": "https://unknown.example.com", **preflight})

    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in blocked.headers
