import json
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import AppState, create_app
from app.service import SessionService
from app.settings import REPO_ROOT, Settings

FIXTURES = REPO_ROOT / "packages" / "contracts" / "fixtures"


class FakeClock:
    """Starts at 2026-10-10 08:30 (+05:30) and advances one second per reading."""

    def __init__(self) -> None:
        self.current = datetime(2026, 10, 10, 3, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        self.current += timedelta(seconds=1)
        return self.current


def make_settings(**overrides: Any) -> Settings:
    base: dict[str, Any] = {
        "_env_file": None,
        "environment": "test",
        "principal_provider": "test",
        "fixed_seed": 42,
        # Never inherit a real provider or key from the developer environment in tests.
        "llm_provider": "disabled",
        "OPENAI_API_KEY": None,
        "GROQ_API_KEY": None,
    }
    return Settings(**{**base, **overrides})


def build_app(settings: Settings | None = None, **kwargs: Any) -> FastAPI:
    clock = FakeClock()

    def factory(*args: Any, **kw: Any) -> SessionService:
        return SessionService(*args, now=clock, **kw)

    return create_app(settings or make_settings(), service_factory=factory, **kwargs)


@pytest.fixture
def app() -> FastAPI:
    return build_app()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def lab(app: FastAPI) -> AppState:
    state: AppState = app.state.lab
    return state


def load_fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def create_request(mode: str = "manual", level: str | None = None, **over: Any) -> dict[str, Any]:
    return {
        "experimentId": "exp04_standard_solution",
        "experimentVersion": "1.1.0",
        "assessmentVersion": "1.0.0",
        "mode": mode,
        "guidanceLevel": level,
        "locale": "en",
        "preLab": None,
        **over,
    }


def submission(envelope: dict[str, Any], seq: int, **over: Any) -> dict[str, Any]:
    return {
        "clientActionId": str(uuid.uuid4()),
        "expectedSequence": seq,
        "envelope": envelope,
        "preview": False,
        **over,
    }


def student(action: dict[str, Any], ack: bool = False) -> dict[str, Any]:
    return {"action": action, "actor": "student", "acknowledgedSafetyWarning": ack}


def start(client: TestClient, mode: str = "manual", level: str | None = None) -> dict[str, Any]:
    response = client.post("/sessions", json=create_request(mode, level))
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def strip_volatile(value: Any) -> Any:
    """Remove server-assigned values (session ID, elapsed time) before comparing with fixtures."""
    if isinstance(value, dict):
        return {
            k: strip_volatile(v) for k, v in value.items() if k not in ("sessionId", "elapsedMs")
        }
    if isinstance(value, list):
        return [strip_volatile(v) for v in value]
    return value


def node_available() -> bool:
    return (
        make_settings().resolved_node() is not None
        and Path(make_settings().verifier_script).is_file()
    )
