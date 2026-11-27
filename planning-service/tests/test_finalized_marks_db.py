"""DAT-010 consumer end to end on a disposable PostgreSQL (PLANNING_TEST_PG_URL), migrated
with the real Alembic chain and seeded with the real topic taxonomy. The assessment
service is faked with httpx.MockTransport; no AI provider is involved.

Never point PLANNING_TEST_PG_URL at a shared or production database: the fixture drops
and recreates the planning schema.
"""

import json
import uuid
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

import httpx
import pytest
from sqlalchemy import func, select

from app.adapters.assessment_feed import OVERLAP, AssessmentFeedClient, pull_finalized_marks
from app.errors import UpstreamServiceError
from app.models import (
    AssessmentDecision,
    IntegrationCursor,
    IntegrationRejection,
    LearnerTopicState,
    RawEvent,
    ReplanLog,
    StudyPlan,
    StudyTask,
    TopicEvidence,
)
from app.schemas.finalized_marks import event_id_for
from app.schemas.plans import PlanInput
from app.services import finalized_marks
from app.services.finalized_marks import ingest_finalized_events, quarantine_summary, release_quarantined
from app.services.plans import create_plan
from app.services.rolling import checkpoint_status, run_checkpoint
from app.services.scheduling import generate_and_commit_schedule
from app.services.topic_registry import TopicRegistry, canonical_topic_ids

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT.parent / "shared" / "contracts"
MOLE = "chem-u3-mole-concept"
GASES = "chem-u4-ideal-gas-equation"
ALICE = "6f1c0d2e-8b3a-4c5d-9e7f-0a1b2c3d4e5f"
BOB = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
NOW = datetime.now(UTC).replace(microsecond=0)
KEY = "planner-integration-key-for-tests"


@pytest.fixture
def session(pg_session):
    return pg_session


def make_registry(*, pending=("U99_9",)) -> TopicRegistry:
    topics = json.loads((CONTRACTS / "topics.json").read_text(encoding="utf-8"))
    approved = {"status": "approved", "reviewedBy": "test reviewer", "reviewedAt": "2026-11-27"}
    aliases = [
        {"source": "assessment", "code": "U03_5", "topicId": MOLE, **approved},
        {"source": "assessment", "code": "U04_1", "topicId": GASES, **approved},
    ]
    for code in pending:
        aliases.append({"source": "assessment", "code": code, "topicId": MOLE, "status": "pending_review"})
    return TopicRegistry({"sources": ["assessment"], "aliases": aliases}, canonical_topic_ids(topics))


REGISTRY = make_registry()


def mark(
    student=ALICE,
    attempt="0ad4ab23-0a22-4546-8027-1293a67fb020",
    point="P1",
    version=0,
    awarded=2.0,
    maximum=3.0,
    codes=("U03_5",),
    evidence_class=None,
    assessed=NOW - timedelta(days=2),
    occurred=None,
):
    entity = f"attempt/{attempt}/point/{point}"
    occurred = occurred or assessed + timedelta(hours=1 + version)
    return {
        "schema_version": "1.0.0",
        "event_id": event_id_for(entity, version),
        "event_type": "assessment.criterion.finalized",
        "producer": "assessment-service",
        "subject_user_id": student,
        "source_entity_id": entity,
        "source_version": version,
        "source_topic_codes": list(codes),
        "status": "final",
        "evidence_class": evidence_class or ("deterministic" if version == 0 else "teacher_verified"),
        "score": {"awarded": awarded, "maximum": maximum},
        "paper_id": 7,
        "assessed_at": assessed.isoformat(),
        "occurred_at": occurred.isoformat(),
    }


def ingest(session, events, registry=REGISTRY, now=NOW):
    report = ingest_finalized_events(session, events, registry, now=now)
    session.commit()
    return report


def evidence(session, student=ALICE, topic=MOLE):
    return session.scalars(
        select(TopicEvidence).where(TopicEvidence.student_id == student, TopicEvidence.topic_id == topic)
    ).all()


def mastery(session, student=ALICE, topic=MOLE):
    return session.scalar(
        select(LearnerTopicState.mastery).where(
            LearnerTopicState.student_id == student, LearnerTopicState.topic_id == topic
        )
    )


def status_of(session, event):
    return session.get(AssessmentDecision, event["event_id"]).status


def task_ids(session, plan_id):
    return sorted(str(t) for t in session.scalars(select(StudyTask.id).where(StudyTask.plan_id == plan_id)))


def plan_input(mode, topics=()):
    return PlanInput(
        mode=mode,
        exam_date=date.today() + timedelta(days=120),
        target_grade="A",
        topics=list(topics),
        availability_windows=[
            {"weekday": day, "start_time": time(16, 0), "end_time": time(19, 0)} for day in range(7)
        ],
        max_session_minutes=60,
    )


def feed(pages):
    """A fake assessment service serving `pages` (lists of events) by `after` cursor."""
    requests = []

    def handler(request):
        requests.append(request)
        assert request.headers["X-Integration-Key"] == KEY
        index = int(request.url.params.get("after", "0"))
        events = pages[index] if index < len(pages) else []
        has_more = index + 1 < len(pages)
        return httpx.Response(
            200,
            json={
                "schema_version": "1.0.0",
                "as_of": NOW.isoformat(),
                "events": events,
                "next_cursor": str(index + 1),
                "has_more": has_more,
            },
        )

    client = AssessmentFeedClient(
        "https://assessment.internal", KEY, transport=httpx.MockTransport(handler), sleep=lambda _: None
    )
    return client, requests


# --- import, idempotency, conflicts ------------------------------------------------------


def test_a_finalized_mark_becomes_evidence_for_its_student_and_mapped_topic(session):
    event = mark(awarded=2, maximum=3)

    report = ingest(session, [event])

    assert report.applied == 1 and report.mastery_changes == 1
    [row] = evidence(session)
    assert (row.student_id, row.topic_id, row.score, row.max_score) == (ALICE, MOLE, 2, 3)
    assert row.observed_at == NOW - timedelta(days=2)  # when the student answered
    decision = session.get(AssessmentDecision, event["event_id"])
    assert decision.status == "applied" and decision.topic_ids == [MOLE]
    assert decision.source_topic_codes == ["U03_5"]  # original code kept for audit
    assert decision.evidence_class == "deterministic"
    raw = session.get(RawEvent, event["event_id"])
    assert raw.source == "assessment-service" and raw.event_type == "assessment.criterion.finalized"
    assert raw.paper_id is None  # assessment paper ids are not planner paper ids
    assert mastery(session) is not None


def test_a_repeated_delivery_does_not_count_twice(session):
    event = mark()
    ingest(session, [event])
    before = mastery(session)

    report = ingest(session, [event, event])

    assert report.duplicates == 2 and report.applied == 0
    assert len(evidence(session)) == 1
    assert mastery(session) == before


def test_a_reused_id_with_different_content_is_rejected(session):
    event = mark(awarded=2)
    ingest(session, [event])
    forged = {**event, "score": {"awarded": 3, "maximum": 3}}

    report = ingest(session, [forged, forged])

    assert report.rejected == 2
    assert session.scalar(select(func.count()).select_from(IntegrationRejection)) == 1  # deduplicated
    [row] = evidence(session)
    assert row.score == 2


# --- corrections and ordering ------------------------------------------------------------


def test_a_teacher_correction_supersedes_the_earlier_decision(session):
    original, corrected = mark(version=0, awarded=0), mark(version=1, awarded=3)
    ingest(session, [original])
    before = mastery(session)

    report = ingest(session, [corrected])

    assert report.superseded == 1 and report.applied == 1
    assert status_of(session, original) == "superseded"
    assert session.get(AssessmentDecision, original["event_id"]).superseded_by == corrected["event_id"]
    [row] = evidence(session)
    assert row.event_id == corrected["event_id"] and row.score == 3
    assert mastery(session) > before
    assert session.get(RawEvent, original["event_id"]) is not None  # audit trail kept


def test_an_older_version_arriving_late_cannot_undo_a_correction(session):
    original, corrected = mark(version=0, awarded=0), mark(version=1, awarded=3)
    ingest(session, [corrected])
    after_correction = mastery(session)

    report = ingest(session, [original])

    assert report.stale == 1 and report.applied == 0
    assert status_of(session, original) == "stale" and status_of(session, corrected) == "applied"
    [row] = evidence(session)
    assert row.score == 3
    assert mastery(session) == after_correction


def test_at_most_one_version_of_a_point_is_ever_applied(session):
    versions = [mark(version=v, awarded=v % 4) for v in (2, 0, 3, 1)]

    ingest(session, versions)

    applied = session.scalars(select(AssessmentDecision).where(AssessmentDecision.status == "applied")).all()
    assert [d.source_version for d in applied] == [3]
    assert [row.score for row in evidence(session)] == [3]


# --- topic mapping -----------------------------------------------------------------------


def test_unknown_or_unapproved_codes_are_quarantined_and_released_after_approval(session):
    unknown, pending, mixed = (
        mark(point="P1", codes=("U77_1",)),
        mark(point="P2", codes=("U99_9",)),
        mark(point="P3", codes=("U03_5", "U77_1")),
    )

    report = ingest(session, [unknown, pending, mixed])

    assert report.quarantined == 3 and report.applied == 0
    assert evidence(session) == [] and mastery(session) is None
    reason = session.get(AssessmentDecision, pending["event_id"]).reason
    assert "U99_9" in reason and "awaiting Chemistry review" in reason
    summary = quarantine_summary(session, REGISTRY)
    unmapped = {(c.code, c.events, c.students) for c in summary.unmapped_codes}
    assert unmapped == {("U77_1", 2, 1), ("U99_9", 1, 1)}

    still_unmapped = release_quarantined(session, REGISTRY, now=NOW)
    session.commit()
    assert still_unmapped.released == 0

    topics = json.loads((CONTRACTS / "topics.json").read_text(encoding="utf-8"))
    approved = {"status": "approved", "reviewedBy": "test reviewer", "reviewedAt": "2026-11-27"}
    reviewed = TopicRegistry(
        {
            "sources": ["assessment"],
            "aliases": [
                {"source": "assessment", "code": "U03_5", "topicId": MOLE, **approved},
                {"source": "assessment", "code": "U77_1", "topicId": MOLE, **approved},
            ],
        },
        canonical_topic_ids(topics),
    )
    released = release_quarantined(session, reviewed, now=NOW)
    session.commit()

    assert released.released == 2  # unknown + mixed; U99_9 is not in this registry at all
    assert status_of(session, pending) == "quarantined"
    assert len(evidence(session)) == 2  # mixed maps both codes to one topic: one row, not two


def test_an_approved_code_maps_to_its_canonical_topic_only(session):
    ingest(session, [mark(codes=("U04_1",), awarded=3)])

    assert [row.topic_id for row in evidence(session, topic=GASES)] == [GASES]
    assert evidence(session, topic=MOLE) == []
    assert mastery(session, topic=MOLE) is None and mastery(session, topic=GASES) is not None


# --- identity ----------------------------------------------------------------------------


def test_marks_never_cross_students(session):
    alice, bob = mark(student=ALICE, awarded=3), mark(student=BOB, attempt=str(uuid.uuid4()), awarded=0)
    ingest(session, [alice, bob])

    assert [row.score for row in evidence(session, ALICE)] == [3]
    assert [row.score for row in evidence(session, BOB)] == [0]
    # A later version of Alice's point that names Bob is refused, not moved to Bob.
    hijack = mark(student=BOB, version=1, awarded=0)
    report = ingest(session, [hijack])

    assert report.rejected == 1
    assert session.get(AssessmentDecision, hijack["event_id"]) is None
    assert [row.score for row in evidence(session, ALICE)] == [3]
    assert [row.score for row in evidence(session, BOB)] == [0]


# --- legacy AI marks ---------------------------------------------------------------------


@pytest.mark.parametrize("evidence_class", ["ai_suggested", "legacy_llm", "llm"])
def test_a_legacy_ai_mark_never_becomes_trusted_evidence(session, evidence_class):
    event = mark(evidence_class=evidence_class, awarded=3)

    report = ingest(session, [event])

    assert report.legacy_unverified == 1 and report.applied == 0
    assert status_of(session, event) == "legacy_unverified"
    assert evidence(session) == [] and mastery(session) is None
    assert session.get(RawEvent, event["event_id"]) is None


# --- batches -----------------------------------------------------------------------------


def test_an_invalid_event_is_rejected_and_the_rest_of_the_page_applies(session):
    good, bad = mark(point="P1"), {**mark(point="P2"), "event_id": str(uuid.uuid4())}

    report = ingest(session, [good, bad, "not an object"])

    assert report.applied == 1 and report.rejected == 2
    assert len(evidence(session)) == 1


def test_a_page_that_fails_midway_rolls_back_and_a_retry_applies_once(session, monkeypatch):
    first, second = mark(point="P1"), mark(point="P2", codes=("U04_1",))
    client, _ = feed([[first, second]])
    real = finalized_marks.recompute_for

    def broken(*args, **kwargs):
        raise RuntimeError("database went away")

    monkeypatch.setattr(finalized_marks, "recompute_for", broken)
    with pytest.raises(RuntimeError):
        pull_finalized_marks(session, client, REGISTRY, now=NOW)

    assert session.scalar(select(func.count()).select_from(AssessmentDecision)) == 0
    assert session.scalar(select(func.count()).select_from(TopicEvidence)) == 0
    cursor = session.get(IntegrationCursor, "assessment-service")
    assert cursor.high_water is None and cursor.last_error == "RuntimeError: unexpected error"

    monkeypatch.setattr(finalized_marks, "recompute_for", real)
    report = pull_finalized_marks(session, client, REGISTRY, now=NOW)

    assert report.applied == 2
    assert len(evidence(session)) == 1 and len(evidence(session, topic=GASES)) == 1
    session.refresh(cursor)
    assert cursor.last_error is None and cursor.high_water is not None


def test_the_pull_pages_through_the_feed_and_resumes_with_an_overlap(session):
    events = [mark(point=f"P{i}", assessed=NOW - timedelta(days=3, minutes=-i)) for i in range(3)]
    client, requests = feed([events[:2], events[2:]])

    first = pull_finalized_marks(session, client, REGISTRY, now=NOW)

    assert (first.pages, first.applied) == (2, 3)
    assert requests[0].url.params["since"] == "2000-01-01T00:00:00+00:00"  # first run backfills
    assert "after" not in requests[0].url.params and requests[1].url.params["after"] == "1"
    cursor = session.get(IntegrationCursor, "assessment-service")
    high_water = max(datetime.fromisoformat(e["occurred_at"]) for e in events)
    assert cursor.high_water == high_water

    requests.clear()
    second = pull_finalized_marks(session, client, REGISTRY, now=NOW)

    assert second.applied == 0 and second.duplicates == 3
    assert datetime.fromisoformat(requests[0].url.params["since"]) == high_water - OVERLAP
    assert len(evidence(session)) == 3


# --- mastery and plans -------------------------------------------------------------------


def test_finalized_marks_change_only_the_marked_topic(session):
    ingest(session, [mark(point="P1", awarded=1), mark(point="P2", codes=("U04_1",), awarded=3)])
    gases = mastery(session, topic=GASES)

    ingest(session, [mark(point="P1", version=1, awarded=3)])

    assert mastery(session, topic=GASES) == gases
    assert [row.score for row in evidence(session)] == [3]


def test_a_correction_flags_the_assessment_plan_and_changes_the_next_plan(session):
    ingest(session, [mark(version=0, awarded=0)])
    create_plan(session, ALICE, plan_input("predicted"))
    plan = session.scalars(select(StudyPlan).where(StudyPlan.student_id == ALICE)).one()
    generate_and_commit_schedule(session, ALICE, plan.id, now=NOW)
    old_mastery = next(i for i in plan.constraints["priorities"] if i["topic_id"] == MOLE)["mastery"]
    assert checkpoint_status(session, ALICE, plan, now=NOW + timedelta(days=4)) == (False, None)

    report = ingest(session, [mark(version=1, awarded=3)])

    assert report.replans_flagged == 1
    session.refresh(plan)
    assert plan.constraints["rolling"]["pending_assessment_evidence"]["topic_ids"] == [MOLE]
    # Throttled like a new paper: not before EVIDENCE_CHECKPOINT_MIN_DAYS.
    assert checkpoint_status(session, ALICE, plan, now=NOW + timedelta(days=1)) == (False, None)
    assert checkpoint_status(session, ALICE, plan, now=NOW + timedelta(days=4)) == (True, "new_evidence")

    result = run_checkpoint(session, ALICE, plan.id, now=NOW + timedelta(days=4))

    assert result.ran and result.trigger == "new_evidence"
    session.refresh(plan)
    new_mastery = next(i for i in plan.constraints["priorities"] if i["topic_id"] == MOLE)["mastery"]
    assert new_mastery > old_mastery
    assert new_mastery == pytest.approx(mastery(session))
    assert not plan.constraints["rolling"].get("pending_assessment_evidence")
    [checkpoint_log] = [
        log
        for log in session.scalars(select(ReplanLog).where(ReplanLog.plan_id == plan.id))
        if log.changes and log.changes[0].get("trigger") == "new_evidence"
    ]
    assert checkpoint_log.changes[0]["assessment_topics"] == [MOLE]


def test_a_tiny_mastery_change_does_not_replan(session):
    ingest(session, [mark(version=0, awarded=2)])
    create_plan(session, ALICE, plan_input("predicted"))

    report = ingest(session, [mark(version=1, awarded=2)])  # teacher confirms the same mark

    assert report.superseded == 1 and report.replans_flagged == 0


def test_manual_planning_works_without_exam_history_and_keeps_its_priorities(session):
    response = create_plan(session, BOB, plan_input("manual", topics=[MOLE, GASES]))
    plan = session.get(StudyPlan, uuid.UUID(response["id"]))
    schedule = generate_and_commit_schedule(session, BOB, plan.id, now=NOW)

    assert schedule.tasks
    assert (
        session.scalar(select(func.count()).select_from(TopicEvidence).where(TopicEvidence.student_id == BOB))
        == 0
    )
    priorities = [dict(item) for item in plan.constraints["priorities"]]

    report = ingest(session, [mark(student=BOB, awarded=0)])

    assert report.applied == 1 and report.replans_flagged == 0
    session.refresh(plan)
    assert plan.constraints["priorities"] == priorities  # the student's own choices


def test_a_failed_pull_leaves_the_existing_plan_and_cursor_alone(session):
    ingest(session, [mark(awarded=1)])
    create_plan(session, ALICE, plan_input("predicted"))
    plan = session.scalars(select(StudyPlan).where(StudyPlan.student_id == ALICE)).one()
    generate_and_commit_schedule(session, ALICE, plan.id, now=NOW)
    constraints = json.dumps(plan.constraints, sort_keys=True)
    tasks = task_ids(session, plan.id)
    assert tasks
    down = AssessmentFeedClient(
        "https://assessment.internal",
        KEY,
        transport=httpx.MockTransport(lambda request: httpx.Response(503)),
        sleep=lambda _: None,
    )

    with pytest.raises(UpstreamServiceError):
        pull_finalized_marks(session, down, REGISTRY, now=NOW)

    session.expire_all()
    plan = session.get(StudyPlan, plan.id)
    assert json.dumps(plan.constraints, sort_keys=True) == constraints
    assert task_ids(session, plan.id) == tasks
    cursor = session.get(IntegrationCursor, "assessment-service")
    assert cursor.high_water is None and cursor.last_error.startswith("UpstreamServiceError")
    assert len(evidence(session)) == 1
