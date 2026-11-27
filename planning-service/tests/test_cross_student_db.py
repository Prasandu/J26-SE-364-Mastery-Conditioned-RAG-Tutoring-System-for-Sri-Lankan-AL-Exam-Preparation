"""SEC-006: one student can never read or change another student's planner data.

Over HTTP, with real signed tokens (HS256 test secret, the same verification path as
production minus JWKS) and a disposable PostgreSQL (PLANNING_TEST_PG_URL). Student B
gets 404 - not 403, so ids do not leak - on every one of student A's plan, task and
notification routes, and A's data is unchanged afterwards.
"""

import json
from datetime import UTC, date, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.db import get_db
from app.main import app
from app.models import Notification, StudyPlan, StudyTask

ALICE = "6f1c0d2e-8b3a-4c5d-9e7f-0a1b2c3d4e5f"
BOB = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
SECRET = "cross-student-test-secret-at-least-32-bytes"


def token(sub: str, *, secret: str = SECRET, expires_in: int = 600) -> dict[str, str]:
    claims = {
        "sub": sub,
        "aud": "authenticated",
        "exp": datetime.now(UTC) + timedelta(seconds=expires_in),
        "user_metadata": {"first_name": "Test"},
    }
    return {"Authorization": f"Bearer {jwt.encode(claims, secret, algorithm='HS256')}"}


@pytest.fixture
def api(pg_session, pg_engine, monkeypatch):
    # HS256 path only: never reach out to a JWKS endpoint from a .env.
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_jwks_url", "")
    monkeypatch.setattr(settings, "supabase_jwt_secret", SECRET)
    factory = sessionmaker(bind=pg_engine, autoflush=False, autocommit=False)

    def db():
        with factory() as session:
            yield session

    app.dependency_overrides[get_db] = db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def alice_plan(api, pg_session):
    body = {
        "mode": "manual",
        "exam_date": (date.today() + timedelta(days=90)).isoformat(),
        "target_grade": "A",
        "topics": ["chem-u3-mole-concept", "chem-u4-ideal-gas-equation"],
        "availability_windows": [
            {"weekday": day, "start_time": "16:00", "end_time": "19:00"} for day in range(7)
        ],
        "max_session_minutes": 60,
    }
    created = api.post("/api/v1/plans", json=body, headers=token(ALICE))
    assert created.status_code == 201, created.text
    plan_id = created.json()["id"]
    generated = api.post(f"/api/v1/plans/{plan_id}/generate", json={}, headers=token(ALICE))
    assert generated.status_code in (200, 201), generated.text
    task_id = str(pg_session.scalars(select(StudyTask.id).where(StudyTask.student_id == ALICE)).first())
    note = Notification(
        student_id=ALICE, type="reminder", title="t", message="m", dedupe_key="cross-student-test"
    )
    pg_session.add(note)
    pg_session.commit()
    return {"plan": plan_id, "task": task_id, "notification": str(note.id), "body": body}


def snapshot(pg_session):
    pg_session.expire_all()
    plans = pg_session.scalars(select(StudyPlan).where(StudyPlan.student_id == ALICE)).all()
    tasks = pg_session.scalars(select(StudyTask).where(StudyTask.student_id == ALICE)).all()
    notes = pg_session.scalars(select(Notification).where(Notification.student_id == ALICE)).all()
    return json.dumps(
        {
            "plans": sorted((str(p.id), p.target_grade, p.constraints) for p in plans),
            "tasks": sorted((str(t.id), t.status, str(t.start_at), t.timer_state) for t in tasks),
            "notes": sorted((str(n.id), str(n.read_at)) for n in notes),
        },
        sort_keys=True,
        default=str,
    )


def bob_requests(ids):
    plan, task, note = ids["plan"], ids["task"], ids["notification"]
    return [
        ("get", f"/api/v1/plans/{plan}", None),
        ("put", f"/api/v1/plans/{plan}", {**ids["body"], "target_grade": "C"}),
        ("get", f"/api/v1/plans/{plan}/schedule", None),
        ("get", f"/api/v1/plans/{plan}/roadmap", None),
        ("post", f"/api/v1/plans/{plan}/generate", {}),
        ("post", f"/api/v1/plans/{plan}/weekly-replan", None),
        ("post", f"/api/v1/plans/{plan}/checkpoint", {"force": True}),
        ("post", f"/api/v1/plans/{plan}/target-choice", {"choice": "adjust_goal"}),
        ("post", f"/api/v1/tasks/{task}/status", {"status": "completed", "actual_duration_min": 30}),
        ("post", f"/api/v1/tasks/{task}/timer/start", None),
        ("post", f"/api/v1/tasks/{task}/timer/pause", None),
        ("post", f"/api/v1/tasks/{task}/timer/resume", None),
        ("post", f"/api/v1/tasks/{task}/timer/finish", None),
        ("post", f"/api/v1/tasks/{task}/undo", None),
        ("post", f"/api/v1/notifications/{note}/read", None),
        ("post", f"/api/v1/predictions/{ALICE}", None),
    ]


def test_another_student_gets_404_everywhere_and_changes_nothing(api, alice_plan, pg_session):
    before = snapshot(pg_session)

    for method, path, body in bob_requests(alice_plan):
        kwargs = {"headers": token(BOB)} | ({"json": body} if body is not None else {})
        response = getattr(api, method)(path, **kwargs)
        assert response.status_code == 404, (method, path, response.status_code, response.text)

    assert snapshot(pg_session) == before


def test_lists_show_only_the_callers_own_data(api, alice_plan):
    assert api.get("/api/v1/plans", headers=token(BOB)).json()["plans"] == []
    assert [p["id"] for p in api.get("/api/v1/plans", headers=token(ALICE)).json()["plans"]] == [
        alice_plan["plan"]
    ]
    bob_notes = api.get("/api/v1/notifications", headers=token(BOB)).json()
    assert alice_plan["notification"] not in json.dumps(bob_notes)
    history = api.get("/api/v1/students/me/topic-history/chem-u3-mole-concept", headers=token(BOB))
    assert history.status_code == 200 and ALICE not in history.text


def test_the_owner_can_still_use_the_same_routes(api, alice_plan):
    assert api.get(f"/api/v1/plans/{alice_plan['plan']}", headers=token(ALICE)).status_code == 200
    started = api.post(f"/api/v1/tasks/{alice_plan['task']}/timer/start", headers=token(ALICE))
    assert started.status_code == 200, started.text


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer not-a-jwt"},
        token(BOB, secret="some-other-secret-at-least-32-bytes-long"),
        token(BOB, expires_in=-60),
    ],
)
def test_no_valid_token_means_401_not_data(api, alice_plan, headers):
    for path in (f"/api/v1/plans/{alice_plan['plan']}", "/api/v1/plans", "/api/v1/notifications"):
        assert api.get(path, headers=headers).status_code == 401
