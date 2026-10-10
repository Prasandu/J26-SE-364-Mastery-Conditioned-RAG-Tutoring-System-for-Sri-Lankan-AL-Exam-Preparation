import pytest
from fastapi.testclient import TestClient

from app.settings import ConfigurationError
from tests.conftest import build_app, make_settings


def test_health_reports_ready_verifier_and_offline_adapters(client: TestClient) -> None:
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["environment"] == "test"
    assert body["verifier"]["ready"] is True
    assert body["adapters"] == {
        "repository": "memory",
        "llm": "disabled",
        "llmModel": None,
        "llmRouting": None,
        "embeddings": "disabled",
    }


def test_health_degrades_without_verifier() -> None:
    app = build_app(make_settings(verifier_script="does/not/exist.mjs"))
    with TestClient(app) as c:
        body = c.get("/health").json()
    assert body["status"] == "degraded"
    assert body["verifier"] == {"ready": False, "engineVersion": None}


def test_health_never_exposes_secrets_or_paths() -> None:
    app = build_app(make_settings(database_url="postgresql://user:secret@db/lab"))
    with TestClient(app) as c:
        text = c.get("/health").text
    assert "secret" not in text
    assert "verifier.mjs" not in text
    assert "C:" not in text and "/home" not in text


@pytest.mark.parametrize(
    "overrides",
    [
        {"environment": "production", "principal_provider": "development", "fixed_seed": None},
        {"environment": "development", "principal_provider": "test", "fixed_seed": None},
        {"environment": "development", "principal_provider": "development", "fixed_seed": 1},
        {"cors_origins": ["*"]},
        {"repository": "postgres"},
    ],
)
def test_unsafe_configuration_is_rejected_at_startup(overrides: dict[str, object]) -> None:
    with pytest.raises(ConfigurationError):
        build_app(make_settings(**overrides))


def test_correlation_id_is_returned(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Correlation-ID": "trace-abc-12345"})
    assert response.headers["X-Correlation-ID"] == "trace-abc-12345"
    generated = client.get("/health", headers={"X-Correlation-ID": "bad id with spaces"})
    assert generated.headers["X-Correlation-ID"] != "bad id with spaces"
