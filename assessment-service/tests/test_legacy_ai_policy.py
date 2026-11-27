"""Legacy AI-marks policy (operator correction 2026-11-27): no AI-only decision is an
official mark, whatever its confidence. Every one goes back to a teacher; confidence only
sets the review priority; originals stay in the audit and on the point; the total is
provisional until a teacher decides. Dry run by default, idempotent, revertible.
Throwaway SQLite (and Postgres when ASSESSMENT_TEST_PG_URL is set)."""

import os

os.environ.setdefault("DATABASE_URL", "sqlite://")

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import (
    Answer,
    AnswerMode,
    Attempt,
    AttemptMode,
    AttemptStatus,
    ContentStatus,
    LegacyAiReclassification,
    MarkingMethod,
    MarkingPoint,
    MarkingScheme,
    Paper,
    PaperKind,
    PointResult,
    PointStatus,
    PointType,
    Question,
    SchemeSource,
    Section,
    User,
    UserRole,
)
from app.schemas.review import ReviewDecisionIn
from app.services.integration import finalized_events
from app.services.legacy_ai_policy import apply_policy, attempt_labels, revert_run, review_priority
from app.services.review import record_decision

PG_URL = os.environ.get("ASSESSMENT_TEST_PG_URL")
NOW = datetime.now(UTC)


@pytest.fixture(params=["sqlite", "postgres"])
def db(request):
    if request.param == "sqlite":
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    elif PG_URL:
        engine = create_engine(PG_URL)
        with engine.begin() as connection:
            connection.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
        Base.metadata.drop_all(engine)
    else:
        pytest.skip("ASSESSMENT_TEST_PG_URL not set")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        yield session
    if request.param == "postgres":
        Base.metadata.drop_all(engine)
    engine.dispose()


POINTS = {
    # code: (method, status, awarded, confidence)
    "KEEP": (MarkingMethod.LLM, PointStatus.AWARDED, 2.0, 0.9),
    "LOW": (MarkingMethod.LLM, PointStatus.AWARDED, 2.0, 0.4),
    "EDGE": (MarkingMethod.LLM, PointStatus.AWARDED, 2.0, 0.5),  # 50% exactly -> teacher
    "NONE": (MarkingMethod.LLM, PointStatus.NOT_AWARDED, 0.0, None),
    "RULE": (MarkingMethod.RULE, PointStatus.AWARDED, 2.0, 1.0),
}


def seed(db: Session) -> Attempt:
    student = User(email="s@school.lk", name="S", password_hash="h", role=UserRole.STUDENT)
    paper = Paper(title="2023 past", kind=PaperKind.PAST, status=ContentStatus.PUBLISHED)
    db.add_all([student, paper])
    db.flush()
    scheme = MarkingScheme(paper_id=paper.id, version=1, source=SchemeSource.OFFICIAL)
    section = Section(paper_id=paper.id, code="A", title="A", answer_mode=next(iter(AnswerMode)))
    db.add_all([scheme, section])
    db.flush()
    question = Question(section_id=section.id, label="1")
    db.add(question)
    db.flush()
    attempt = Attempt(
        id=uuid.uuid4(),
        paper_id=paper.id,
        scheme_id=scheme.id,
        student_ref=student.email,
        mode=AttemptMode.DIGITAL,
        status=AttemptStatus.MARKED,
        score=8.0,
        max_score=10,
        submitted_at=NOW - timedelta(days=30),
        marked_at=NOW - timedelta(days=30),
    )
    answer = Answer(attempt=attempt, question_id=question.id, text="x", score=8.0)
    db.add_all([attempt, answer])
    for code, (method, status, awarded, confidence) in POINTS.items():
        point = MarkingPoint(
            scheme_id=scheme.id,
            question_id=question.id,
            code=code,
            description=code,
            marks=2,
            point_type=PointType.CONCEPT,
        )
        db.add(point)
        db.add(
            PointResult(
                answer=answer,
                point=point,
                status=status,
                awarded=awarded,
                method=method,
                confidence=confidence,
                ai_awarded=status == PointStatus.AWARDED if method == MarkingMethod.LLM else None,
                evidence="quoted evidence",
            )
        )
    db.commit()
    return attempt


def by_code(db: Session) -> dict[str, PointResult]:
    return {r.point.code: r for r in db.scalars(select(PointResult))}


AI_CODES = ("KEEP", "LOW", "EDGE", "NONE")


def test_confidence_only_sets_the_review_priority():
    assert review_priority(0.5, 0.5) == "high" and review_priority(None, 0.5) == "high"
    assert review_priority(0.51, 0.5) == "normal" and review_priority(0.99, 0.5) == "normal"


def test_a_dry_run_changes_nothing_but_the_total_is_already_provisional(db):
    attempt = seed(db)

    report = apply_policy(db, apply=False)
    db.rollback()

    assert report.summary() == {
        "run_id": None,
        "applied": False,
        "priority_threshold": 0.5,
        "sent_to_review": 4,
        "high_priority": 3,
        "normal_priority": 1,
        "attempts": 1,
        "students": 1,
    }
    assert db.scalar(select(func.count()).select_from(LegacyAiReclassification)) == 0
    db.refresh(attempt)
    assert attempt.status == AttemptStatus.MARKED and attempt.score == 8.0
    assert by_code(db)["KEEP"].status == PointStatus.AWARDED
    # Not reconciled yet, and still not an official result: AI-only marks are in the total.
    assert attempt_labels(attempt)["includes_ai_judged_marks"] is True
    assert attempt_labels(attempt)["score_is_provisional"] is True


def test_every_ai_only_decision_goes_to_a_teacher_whatever_its_confidence(db):
    attempt = seed(db)

    report = apply_policy(db, apply=True)

    points = by_code(db)
    for code in AI_CODES:  # including KEEP, decided with confidence 0.9
        assert points[code].status == PointStatus.NEEDS_REVIEW and points[code].awarded == 0
        assert points[code].evidence == "quoted evidence"  # the AI's suggestion is kept
        assert "not a validated mark" in points[code].reason
    assert points["KEEP"].ai_awarded is True and points["KEEP"].confidence == 0.9
    assert points["RULE"].status == PointStatus.AWARDED and points["RULE"].method == MarkingMethod.RULE
    db.refresh(attempt)
    assert attempt.status == AttemptStatus.SUBMITTED and attempt.score == 8.0  # original total kept
    assert attempt_labels(attempt) == {
        "includes_ai_judged_marks": False,
        "points_awaiting_teacher": 4,
        "score_is_provisional": True,
    }
    audit = {a.point_result_id: a for a in db.scalars(select(LegacyAiReclassification))}
    assert len(audit) == 4 and {a.run_id for a in audit.values()} == {report.run_id}
    assert {a.action for a in audit.values()} == {"sent_to_review"}
    assert audit[points["KEEP"].id].review_priority == "normal"
    assert {audit[points[c].id].review_priority for c in ("LOW", "EDGE", "NONE")} == {"high"}
    assert audit[points["KEEP"].id].previous_status == "awarded"  # original result preserved
    assert audit[points["KEEP"].id].previous_awarded == 2.0


def test_ai_only_marks_never_reach_the_planner_feed(db):
    attempt = seed(db)
    student = db.scalar(select(User).where(User.email == attempt.student_ref))
    student.supabase_user_id = "6f1c0d2e-8b3a-4c5d-9e7f-0a1b2c3d4e5f"
    db.commit()

    before = finalized_events(db, since=NOW - timedelta(days=60)).events
    apply_policy(db, apply=True)
    after = finalized_events(db, since=NOW - timedelta(days=60)).events

    assert [e.source_entity_id.rsplit("/", 1)[1] for e in before] == ["RULE"]  # not KEEP (0.9)
    assert after == []  # the attempt is waiting for a teacher again


def test_a_second_run_touches_nothing_new(db):
    seed(db)
    apply_policy(db, apply=True)

    again = apply_policy(db, apply=True)

    assert again.sent_to_review == 0
    assert db.scalar(select(func.count()).select_from(LegacyAiReclassification)) == 4


def test_points_only_labelled_under_the_superseded_policy_are_sent_now(db):
    attempt = seed(db)
    keep = by_code(db)["KEEP"]
    db.add(
        LegacyAiReclassification(
            run_id=uuid.uuid4(),
            run_at=NOW,
            threshold=0.5,
            point_result_id=keep.id,
            attempt_id=attempt.id,
            action="kept_labelled",
            previous_status="awarded",
            previous_awarded=2.0,
            previous_attempt_status="marked",
            confidence=0.9,
        )
    )
    db.commit()

    report = apply_policy(db, apply=True)

    assert report.sent_to_review == 4
    assert by_code(db)["KEEP"].status == PointStatus.NEEDS_REVIEW


def test_teacher_decisions_finalize_the_total(db):
    attempt = seed(db)
    apply_policy(db, apply=True)
    points = by_code(db)

    for code, awarded in (("KEEP", True), ("LOW", False), ("EDGE", True), ("NONE", True)):
        record_decision(
            db,
            points[code].id,
            ReviewDecisionIn(awarded=awarded, teacher_ref="t@school.lk", saw_machine=True),
        )

    db.refresh(attempt)
    assert attempt.status == AttemptStatus.MARKED
    assert attempt.score == 8.0  # RULE 2 + KEEP 2 + EDGE 2 + NONE 2; LOW now 0
    assert attempt_labels(attempt) == {
        "includes_ai_judged_marks": False,
        "points_awaiting_teacher": 0,
        "score_is_provisional": False,
    }
    assert {by_code(db)[c].method for c in AI_CODES} == {MarkingMethod.TEACHER}


def test_a_revert_restores_untouched_points_and_keeps_teacher_decisions(db):
    attempt = seed(db)
    report = apply_policy(db, apply=True)
    points = by_code(db)
    record_decision(
        db, points["LOW"].id, ReviewDecisionIn(awarded=False, teacher_ref="t@school.lk", saw_machine=False)
    )

    reverted = revert_run(db, report.run_id)

    points = by_code(db)
    assert reverted == 3  # KEEP, EDGE, NONE; LOW was decided by a teacher
    assert points["KEEP"].status == PointStatus.AWARDED and points["KEEP"].awarded == 2
    assert points["NONE"].status == PointStatus.NOT_AWARDED
    assert points["LOW"].method == MarkingMethod.TEACHER and points["LOW"].awarded == 0
    db.refresh(attempt)
    assert attempt.status == AttemptStatus.MARKED
    assert attempt_labels(attempt)["score_is_provisional"] is True  # AI-only marks are back in


def test_the_priority_threshold_must_be_a_probability(db):
    with pytest.raises(ValueError):
        apply_policy(db, priority_threshold=1.5)
