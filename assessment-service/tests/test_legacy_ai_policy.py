"""Legacy AI-marks policy (operator decision 2026-11-27): AI-decided points with
confidence <= 0.5 (or none) go back to a teacher; the rest stay, labelled as AI-judged.
Dry run by default, audited, idempotent, revertible; the total is provisional until the
teacher decides. Throwaway SQLite (and Postgres when ASSESSMENT_TEST_PG_URL is set)."""

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
from app.services.legacy_ai_policy import apply_policy, attempt_labels, goes_to_review, revert_run
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


def test_the_cut_off_is_inclusive_and_missing_confidence_counts_as_low():
    assert goes_to_review(0.5, 0.5) and goes_to_review(0.1, 0.5) and goes_to_review(None, 0.5)
    assert not goes_to_review(0.51, 0.5)


def test_a_dry_run_changes_nothing(db):
    attempt = seed(db)

    report = apply_policy(db, apply=False)
    db.rollback()

    assert report.summary() | {"run_id": None} == {
        "run_id": None,
        "applied": False,
        "threshold": 0.5,
        "sent_to_review": 3,
        "kept_labelled": 1,
        "attempts": 1,
        "students": 1,
    }
    assert db.scalar(select(func.count()).select_from(LegacyAiReclassification)) == 0
    db.refresh(attempt)
    assert attempt.status == AttemptStatus.MARKED and attempt.score == 8.0
    assert by_code(db)["LOW"].status == PointStatus.AWARDED


def test_applying_sends_low_confidence_points_to_a_teacher_and_labels_the_rest(db):
    attempt = seed(db)

    report = apply_policy(db, apply=True)

    points = by_code(db)
    for code in ("LOW", "EDGE", "NONE"):
        assert points[code].status == PointStatus.NEEDS_REVIEW and points[code].awarded == 0
        assert points[code].evidence == "quoted evidence"  # the AI's suggestion is kept
    assert points["LOW"].ai_awarded is True and points["LOW"].confidence == 0.4
    assert points["KEEP"].status == PointStatus.AWARDED and points["KEEP"].awarded == 2
    assert points["RULE"].status == PointStatus.AWARDED and points["RULE"].method == MarkingMethod.RULE
    db.refresh(attempt)
    assert attempt.status == AttemptStatus.SUBMITTED and attempt.score == 8.0  # provisional total
    assert attempt_labels(attempt) == {
        "includes_ai_judged_marks": True,
        "points_awaiting_teacher": 3,
        "score_is_provisional": True,
    }
    audit = db.scalars(select(LegacyAiReclassification)).all()
    assert len(audit) == 4 and {a.run_id for a in audit} == {report.run_id}
    assert sorted(a.action for a in audit) == ["kept_labelled"] + ["sent_to_review"] * 3


def test_a_second_run_touches_nothing_new(db):
    seed(db)
    apply_policy(db, apply=True)

    again = apply_policy(db, apply=True)

    assert (again.sent_to_review, again.kept_labelled) == (0, 0)
    assert db.scalar(select(func.count()).select_from(LegacyAiReclassification)) == 4


def test_teacher_decisions_finalize_the_total(db):
    attempt = seed(db)
    apply_policy(db, apply=True)
    points = by_code(db)

    for code, awarded in (("LOW", False), ("EDGE", True), ("NONE", True)):
        record_decision(
            db,
            points[code].id,
            ReviewDecisionIn(awarded=awarded, teacher_ref="t@school.lk", saw_machine=True),
        )

    db.refresh(attempt)
    assert attempt.status == AttemptStatus.MARKED
    assert attempt.score == 8.0  # KEEP 2 + RULE 2 + EDGE 2 + NONE 2 (LOW now 0)
    assert attempt_labels(attempt)["score_is_provisional"] is False
    assert by_code(db)["LOW"].method == MarkingMethod.TEACHER


def test_a_revert_restores_untouched_points_and_keeps_teacher_decisions(db):
    attempt = seed(db)
    report = apply_policy(db, apply=True)
    points = by_code(db)
    record_decision(
        db, points["LOW"].id, ReviewDecisionIn(awarded=False, teacher_ref="t@school.lk", saw_machine=False)
    )

    reverted = revert_run(db, report.run_id)

    points = by_code(db)
    assert reverted == 3  # EDGE, NONE and the KEEP label; LOW was decided by a teacher
    assert points["EDGE"].status == PointStatus.AWARDED and points["EDGE"].awarded == 2
    assert points["NONE"].status == PointStatus.NOT_AWARDED
    assert points["LOW"].method == MarkingMethod.TEACHER and points["LOW"].awarded == 0
    db.refresh(attempt)
    assert attempt.status == AttemptStatus.MARKED
    assert all(
        a.reverted_at is not None
        for a in db.scalars(select(LegacyAiReclassification))
        if a.point_result_id != points["LOW"].id
    )


def test_the_threshold_must_be_a_probability(db):
    with pytest.raises(ValueError):
        apply_policy(db, threshold=1.5)
