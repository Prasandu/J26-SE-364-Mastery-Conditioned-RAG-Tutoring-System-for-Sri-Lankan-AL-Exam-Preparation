import pytest
from fastapi import Request

from app.auth import get_current_user_id
from app.main import app


async def _fake_current_user_id(request: Request) -> str:
    """Test-only override: echo back whatever student_id the request is
    actually about (path param or JSON body field), so app.auth.require_self
    trivially passes without needing a real Supabase JWT. Real verification
    is exercised separately in tests/test_auth.py.
    """
    if "student_id" in request.path_params:
        return request.path_params["student_id"]
    try:
        body = await request.json()
    except Exception:
        return "test-user"
    return body.get("student_id", "test-user")


@pytest.fixture(autouse=True)
def _override_auth():
    app.dependency_overrides[get_current_user_id] = _fake_current_user_id
    yield
    app.dependency_overrides.pop(get_current_user_id, None)
