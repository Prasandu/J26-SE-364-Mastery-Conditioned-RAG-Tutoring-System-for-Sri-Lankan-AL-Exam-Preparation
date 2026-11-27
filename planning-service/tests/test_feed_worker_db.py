"""C2 -> C3 synchronisation on the disposable PostgreSQL (PLANNING_TEST_PG_URL): one run
at a time across replicas, and the operator status route."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.adapters.assessment_feed import AssessmentFeedClient, pull_finalized_marks
from app.config import settings
from app.db import get_db
from app.main import app
from app.schemas.finalized_marks import PullReport
from app.services.feed_worker import RunLock, run_round
from app.services.topic_registry import TopicRegistry, canonical_topic_ids

OPERATOR = "operator-ingest-key-123456"


def test_only_one_replica_pulls_at_a_time(pg_engine):
    first, second = RunLock(pg_engine), RunLock(pg_engine)
    calls = []

    assert first.acquire()
    try:
        skipped = run_round(lambda: calls.append(1) or PullReport(), second)
    finally:
        first.release()
    ran = run_round(lambda: calls.append(1) or PullReport(applied=2), second)

    assert skipped == {"ok": True, "skipped": "another replica is pulling"}
    assert ran["report"]["applied"] == 2 and calls == [1]


def test_a_round_that_fails_still_releases_the_lock(pg_engine):
    lock = RunLock(pg_engine)

    with pytest.raises(RuntimeError):
        run_round(lambda: (_ for _ in ()).throw(RuntimeError("boom")), lock)

    other = RunLock(pg_engine)
    assert other.acquire()
    other.release()


def test_the_status_route_reports_the_last_pull(pg_session, pg_engine, monkeypatch):
    monkeypatch.setattr(settings, "ingest_api_key", OPERATOR)
    monkeypatch.setattr(settings, "assessment_service_url", "https://assessment.internal")
    monkeypatch.setattr(settings, "assessment_service_api_key", "planner-integration-key-for-tests")
    factory = sessionmaker(bind=pg_engine, autoflush=False)

    def db():
        with factory() as session:
            yield session

    app.dependency_overrides[get_db] = db
    try:
        client = TestClient(app)
        before = client.get("/api/v1/integration/assessment/status", headers={"X-Integration-Key": OPERATOR})
        page = {"schema_version": "1.0.0", "events": [], "next_cursor": None, "has_more": False}
        feed = AssessmentFeedClient(
            "https://assessment.internal",
            "planner-integration-key-for-tests",
            transport=httpx.MockTransport(lambda request: httpx.Response(200, json=page)),
        )
        topics = json.loads(
            (Path(__file__).resolve().parents[2] / "shared/contracts/topics.json").read_text("utf-8")
        )
        pull_finalized_marks(
            pg_session, feed, TopicRegistry({"sources": [], "aliases": []}, canonical_topic_ids(topics))
        )
        after = client.get("/api/v1/integration/assessment/status", headers={"X-Integration-Key": OPERATOR})
        denied = client.get(
            "/api/v1/integration/assessment/status", headers={"Authorization": "Bearer a-students-token"}
        )
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert before.status_code == 200 and before.json()["last_success_at"] is None
    assert before.json()["configured"] is True
    body = after.json()
    assert body["last_error"] is None and body["quarantined_events"] == 0
    assert datetime.fromisoformat(body["last_success_at"]) > datetime.now(UTC) - timedelta(minutes=1)
    assert 0 <= body["seconds_since_success"] < 60
    assert "planner-integration-key-for-tests" not in after.text
    assert denied.status_code == 401
