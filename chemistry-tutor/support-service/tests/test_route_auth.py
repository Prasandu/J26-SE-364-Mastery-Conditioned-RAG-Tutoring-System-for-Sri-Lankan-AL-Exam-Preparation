"""SEC-007a/b/c: who may call which support-service route.

- /tutor/ask, /voice/transcribe, /voice/synthesize call paid providers: a signed-in
  caller is required, and an anonymous request must never reach the provider.
- /tutor/ask-raw (ungrounded) is 404 unless ENABLE_RAW_TUTOR=true, which the
  settings refuse in production.
- POST /practice/flagged-questions is machine ingestion: an X-Integration-Key only,
  never an end-user token.

conftest.py replaces get_current_user_id for every test; the `real_auth` fixture
removes that override so the actual Supabase JWT check runs (and fails, since no
valid token is sent). Nothing here contacts a provider, Supabase or a database.
"""

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

import app.api.practice as practice_module
import app.api.tutor as tutor_module
import app.api.voice as voice_module
import app.security as security_module
from app.auth import get_current_user_id
from app.main import app
from app.security import require_integration_caller

client = TestClient(app)  # no `with`: the lifespan (DB + model warm-up) does not run
KEY = "k" * 24


@pytest.fixture
def real_auth():
    saved = app.dependency_overrides.pop(get_current_user_id, None)
    yield
    if saved is not None:
        app.dependency_overrides[get_current_user_id] = saved


@pytest.fixture
def providers(monkeypatch):
    """Recording fakes for every paid call these routes can make."""
    calls: list[str] = []

    def answer_question(db, question, language, concise=False):
        calls.append("answer_question")
        return SimpleNamespace(answer="a", citations=[], grounded=True)

    class Provider:
        def generate_response(self, system_prompt, user_message):
            calls.append("llm")
            return "raw"

    monkeypatch.setattr(tutor_module, "answer_question", answer_question)
    monkeypatch.setattr(tutor_module, "get_llm_provider", lambda: Provider())
    monkeypatch.setattr(voice_module, "transcribe_audio", lambda *a, **k: calls.append("stt") or "text")
    monkeypatch.setattr(
        voice_module, "synthesize_sinhala_speech", lambda *a, **k: calls.append("tts") or b"RIFF"
    )
    return calls


def _paid_calls():
    return [
        ("post", "/api/v1/tutor/ask", {"json": {"question": "What is a mole?"}}),
        ("post", "/api/v1/voice/transcribe", {"files": {"audio": ("a.webm", b"\x00" * 10, "audio/webm")}}),
        ("post", "/api/v1/voice/synthesize", {"json": {"text": "මවුලය"}}),
    ]


# --- SEC-007a: paid routes need a signed-in caller --------------------------------


@pytest.mark.parametrize("method,path,kwargs", _paid_calls(), ids=["ask", "transcribe", "synthesize"])
@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer not-a-jwt"}, {"Authorization": "Basic abc"}],
    ids=["no-token", "garbage-token", "wrong-scheme"],
)
def test_paid_routes_reject_unauthenticated_callers_before_any_provider_call(
    real_auth, providers, method, path, kwargs, headers
):
    response = getattr(client, method)(path, headers=headers, **kwargs)

    assert response.status_code == 401
    assert providers == []  # nothing reached a (paid) provider


@pytest.mark.parametrize("method,path,kwargs", _paid_calls(), ids=["ask", "transcribe", "synthesize"])
def test_paid_routes_still_work_for_a_signed_in_caller(providers, method, path, kwargs):
    response = getattr(client, method)(path, **kwargs)

    assert response.status_code == 200
    assert len(providers) == 1


# --- SEC-007b: the ungrounded raw tutor is off ---------------------------------------


def test_raw_tutor_is_not_found_by_default(providers):
    response = client.post("/api/v1/tutor/ask-raw", json={"question": "What is a mole?"})

    assert response.status_code == 404
    assert providers == []


def test_raw_tutor_works_only_when_enabled_and_signed_in(monkeypatch, providers):
    monkeypatch.setattr(security_module.settings, "enable_raw_tutor", True)

    response = client.post("/api/v1/tutor/ask-raw", json={"question": "What is a mole?"})

    assert response.status_code == 200
    assert providers == ["llm"]


def test_raw_tutor_enabled_still_rejects_anonymous_callers(monkeypatch, real_auth, providers):
    monkeypatch.setattr(security_module.settings, "enable_raw_tutor", True)

    response = client.post("/api/v1/tutor/ask-raw", json={"question": "What is a mole?"})

    assert response.status_code == 401
    assert providers == []


# --- SEC-007c: flagged-question ingestion is service-only -----------------------------


FLAG = {
    "student_id": "6f1c0d2e-8b3a-4c5d-9e7f-0a1b2c3d4e5f",
    "source": "model_paper",
    "question_text": "Calculate the moles in 26.5 g of Na2CO3.",
    "topic": "Mole concept",
    "submitted_answer": "0.5",
    "correct_answer": "0.25",
}


@pytest.fixture
def stored(monkeypatch):
    rows: list = []

    def create(db, new):
        row = SimpleNamespace(id=len(rows) + 1, status="pending", created_at=datetime.now(UTC), **vars(new))
        rows.append(row)
        return row

    monkeypatch.setattr(practice_module, "create_flagged_question", create)
    return rows


def test_ingest_is_switched_off_without_a_configured_key(monkeypatch, stored):
    monkeypatch.setattr(security_module.settings, "integration_key_component2", "")

    response = client.post(
        "/api/v1/practice/flagged-questions", json=FLAG, headers={"X-Integration-Key": KEY}
    )

    assert response.status_code == 503
    assert stored == []


@pytest.mark.parametrize(
    "headers",
    [{}, {"X-Integration-Key": "wrong-key-wrong-key"}, {"Authorization": "Bearer a-students-token"}],
    ids=["no-key", "wrong-key", "end-user-token-only"],
)
def test_ingest_rejects_anyone_without_the_service_key(monkeypatch, stored, headers):
    """Includes a signed-in student (conftest's auth override is active here): a user
    token can no longer create mistake records for any student_id."""
    monkeypatch.setattr(security_module.settings, "integration_key_component2", KEY)

    response = client.post("/api/v1/practice/flagged-questions", json=FLAG, headers=headers)

    assert response.status_code == 401
    assert stored == []


def test_ingest_accepts_the_reporting_service(monkeypatch, stored):
    monkeypatch.setattr(security_module.settings, "integration_key_component2", KEY)

    response = client.post(
        "/api/v1/practice/flagged-questions", json=FLAG, headers={"X-Integration-Key": KEY}
    )

    assert response.status_code == 200
    assert response.json()["student_id"] == FLAG["student_id"]
    assert len(stored) == 1


# --- inventory: no route is left open by accident ------------------------------------

# Intentionally public: health, and the question bank listing/detail (no student data).
PUBLIC = {"/api/v1/health", "/api/v1/questions", "/api/v1/questions/{question_code}"}


def _dependency_calls(dependant) -> set:
    found = {dependant.call}
    for sub in dependant.dependencies:
        found |= _dependency_calls(sub)
    return found


def test_every_non_public_route_requires_a_user_or_a_service():
    unguarded = [
        f"{sorted(route.methods)} {route.path}"
        for route in app.routes
        if isinstance(route, APIRoute)
        and route.path.startswith("/api/v1")
        and route.path not in PUBLIC
        and not (_dependency_calls(route.dependant) & {get_current_user_id, require_integration_caller})
    ]

    assert unguarded == []
