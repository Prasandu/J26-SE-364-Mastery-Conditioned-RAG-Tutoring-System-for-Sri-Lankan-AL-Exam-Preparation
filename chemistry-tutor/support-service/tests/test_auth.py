"""Tests for app.auth itself (JWT verification). These use a throwaway
FastAPI app rather than app.main's app, since conftest.py's autouse fixture
overrides get_current_user_id globally on app.main's app for every other
test — here we want the real dependency to actually run.
"""

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.auth import get_current_user_id, require_self


def test_require_self_passes_on_match():
    require_self("same-id", "same-id")  # no exception == pass


def test_require_self_raises_on_mismatch():
    with pytest.raises(HTTPException) as exc_info:
        require_self("student-a", "student-b")
    assert exc_info.value.status_code == 403


def _protected_app() -> TestClient:
    app = FastAPI()

    @app.get("/protected")
    def protected(current_user_id: str = Depends(get_current_user_id)):
        return {"user_id": current_user_id}

    return TestClient(app)


def test_missing_authorization_header_returns_401():
    response = _protected_app().get("/protected")
    assert response.status_code == 401


def test_malformed_authorization_header_returns_401():
    response = _protected_app().get("/protected", headers={"Authorization": "NotBearer sometoken"})
    assert response.status_code == 401


def test_invalid_token_signature_returns_401():
    # Well-formed JWT shape but a bogus signature/key — must fail verification.
    fake_token = (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJzdWIiOiJmYWtlLXVzZXIiLCJleHAiOjk5OTk5OTk5OTl9."
        "not-a-real-signature"
    )
    response = _protected_app().get("/protected", headers={"Authorization": f"Bearer {fake_token}"})
    assert response.status_code == 401
