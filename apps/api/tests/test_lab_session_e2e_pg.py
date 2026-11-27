"""LAB-018 end to end on the server: Supabase-signed students, PostgreSQL sessions, over HTTP.

A student's practical (session + recorded action) survives an API restart; another student
gets 404 for it, never a 403 that would confirm it exists; no or a forged token is 401; a
retried action (same clientActionId) is applied once. Disposable PostgreSQL (LAB_TEST_PG_URL)
migrated with the real supabase/migrations SQL; the signing keys are local test keys.
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app import principal as principal_module
from app import repositories_pg
from tests.conftest import build_app, create_request, make_settings, submission
from tests.test_api import CONFIRM
from tests.test_repositories_pg import PG_URL, dsn  # noqa: F401 - fixture

pytestmark = pytest.mark.skipif(not PG_URL, reason="LAB_TEST_PG_URL (disposable Postgres) not set")

KEY = ec.generate_private_key(ec.SECP256R1())
FORGER = ec.generate_private_key(ec.SECP256R1())
STUDENT_A = "6f1c0d2e-8b3a-4c5d-9e7f-0a1b2c3d4e5f"
STUDENT_B = "7a2d1e3f-9c4b-4d6e-8f70-1b2c3d4e5f60"


def token(sub: str, key: Any = KEY) -> str:
    claims = {"sub": sub, "aud": "authenticated", "exp": datetime.now(UTC) + timedelta(hours=1)}
    return jwt.encode(claims, key, algorithm="ES256", headers={"kid": "test"})


@pytest.fixture(autouse=True)
def fake_jwks(monkeypatch: pytest.MonkeyPatch) -> None:
    keys = SimpleNamespace(
        get_signing_key_from_jwt=lambda _t: SimpleNamespace(key=KEY.public_key())
    )
    monkeypatch.setattr(principal_module, "_jwks_client", lambda _url: keys)


@pytest.fixture
def api(dsn: str) -> Iterator[Any]:  # noqa: F811 - the imported fixture
    settings = make_settings(
        principal_provider="supabase_jwt",
        supabase_url="https://example.supabase.co",
        repository="postgres",
        database_url=dsn,
    )

    def open_app() -> TestClient:
        return TestClient(build_app(settings))

    yield open_app
    repositories_pg._pool(dsn).close()
    repositories_pg._pool.cache_clear()


def signed(client: TestClient, sub: str | None, key: Any = KEY) -> TestClient:
    client.headers.pop("Authorization", None)
    if sub is not None:
        client.headers["Authorization"] = f"Bearer {token(sub, key)}"
    return client


def test_a_practical_survives_a_restart_and_stays_the_students_own(api: Any, dsn: str) -> None:  # noqa: F811
    with api() as first:
        signed(first, STUDENT_A)
        created = first.post("/sessions", json=create_request("manual"))
        assert created.status_code == 201, created.text
        sid = created.json()["session"]["sessionId"]
        action = submission(CONFIRM, 0)
        assert first.post(f"/sessions/{sid}/actions", json=action).status_code == 200
        retried = first.post(f"/sessions/{sid}/actions", json=action)  # e.g. after a token refresh
        assert retried.status_code == 200
        before = first.get(f"/sessions/{sid}").json()

    # The API process restarts: nothing is left in memory, the pool reconnects.
    repositories_pg._pool(dsn).close()
    repositories_pg._pool.cache_clear()

    with api() as second:
        after = signed(second, STUDENT_A).get(f"/sessions/{sid}")
        assert after.status_code == 200
        assert after.json() == before
        assert after.json()["session"]["nextSequence"] == 1  # the retry was not applied twice
        assert signed(second, STUDENT_B).get(f"/sessions/{sid}").status_code == 404
        assert (
            signed(second, STUDENT_B)
            .post(f"/sessions/{sid}/actions", json=submission(CONFIRM, 1))
            .status_code
            == 404
        )
        assert signed(second, None).get(f"/sessions/{sid}").status_code == 401
        assert signed(second, STUDENT_A, key=FORGER).get(f"/sessions/{sid}").status_code == 401
