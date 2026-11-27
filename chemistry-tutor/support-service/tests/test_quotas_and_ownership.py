"""C4 authorization hardening: per-user rate limits with daily caps on paid provider
calls, and 404 (not 403) for another student's flagged question, whose ids are
sequential. No provider, database or network."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

import app.api.practice as practice_module
import app.auth as auth_module
from app.auth import get_current_user_id
from app.main import app
from app.rate_limit import limiter, principal_key

client = TestClient(app)  # no `with`: the lifespan (DB + model warm-up) does not run


def request(state_user: str | None = None) -> Request:
    scope = {"type": "http", "method": "POST", "path": "/", "headers": [], "client": ("10.0.0.7", 1234)}
    req = Request(scope)
    if state_user is not None:
        req.state.user_id = state_user
    return req


def test_limits_are_keyed_by_the_signed_in_user_not_the_shared_ip():
    assert principal_key(request("user-a")) == "user:user-a"
    assert principal_key(request("user-b")) == "user:user-b"
    assert principal_key(request()) == "ip:10.0.0.7"  # only before sign-in is known


def test_verifying_a_token_records_the_user_for_rate_limiting(monkeypatch):
    class FakeJwks:
        def get_signing_key_from_jwt(self, token):
            return SimpleNamespace(key="k")

    monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: FakeJwks())
    monkeypatch.setattr(auth_module.jwt, "decode", lambda *a, **k: {"sub": "user-42"})
    req = request()

    assert auth_module.get_current_user_id(req, "Bearer a.b.c") == "user-42"
    assert req.state.user_id == "user-42" and principal_key(req) == "user:user-42"


@pytest.mark.parametrize(
    "route",
    [
        "app.api.tutor.ask",
        "app.api.tutor.ask_raw",
        "app.api.voice.transcribe",
        "app.api.voice.synthesize",
        "app.api.practice.explain",
        "app.api.students.student_consultation",
        "app.api.students.student_wivarana_report",
    ],
)
def test_every_paid_provider_route_has_a_daily_cap(route):
    limits = [str(limit.limit) for limit in limiter._route_limits.get(route, [])]

    assert any("minute" in text for text in limits), limits
    assert any("day" in text for text in limits), limits


def test_another_students_flagged_question_is_not_found_rather_than_forbidden(monkeypatch):
    monkeypatch.setattr(
        practice_module,
        "get_flagged_question",
        lambda db, flagged_id: SimpleNamespace(student_id="someone-else"),
    )
    app.dependency_overrides[get_current_user_id] = lambda: "student-1"
    for action, body in (("explain", None), ("hint", {}), ("check", {"submitted_answer": "x"})):
        kwargs = {"json": body} if body is not None else {}
        response = client.post(f"/api/v1/practice/flagged-questions/7/{action}", **kwargs)
        assert response.status_code == 404, (action, response.status_code, response.text)
        assert "someone-else" not in response.text
