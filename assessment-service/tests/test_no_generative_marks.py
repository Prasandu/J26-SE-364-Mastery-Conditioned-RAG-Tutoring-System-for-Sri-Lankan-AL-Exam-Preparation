"""GRD-011: no generative model awards, withholds or alters an official mark.

Before: a confident AI verdict on a text point, or on a drawing, became
awarded / not_awarded (method = llm), and those points counted towards mastery and
the /integration feed the planner reads. After: every model verdict ends in teacher
review as a non-binding suggestion; only a rule, the deterministic checker or a
teacher decides; and only those decisions count as evidence.

Offline: fake judges, in-memory objects and a throwaway SQLite database.
"""

import os

os.environ.setdefault("DATABASE_URL", "sqlite://")

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.ai.judge import PointVerdict
from app.db import Base
from app.models import (
    Answer,
    Attempt,
    AttemptMode,
    AttemptStatus,
    MarkingMethod,
    MarkingPoint,
    PointResult,
    PointStatus,
    PointType,
)
from app.services import marking, mastery
from app.services.drawing_judge import DrawingVerdict

ANSWER_TEXT = "Na2CO3 has a molar mass of 106 g/mol, so 26.5 g is 0.25 mol."


def point(code="P1", point_type=PointType.CONCEPT, marks=2.0) -> MarkingPoint:
    return MarkingPoint(
        code=code, description="States the amount in moles", marks=marks, point_type=point_type
    )


def pending(p: MarkingPoint, checker_awarded=None) -> PointResult:
    return PointResult(point=p, status=PointStatus.PENDING, awarded=0.0, checker_awarded=checker_awarded)


class AlwaysFullMarks:
    """R24: a judge that is completely sure every point earns full marks."""

    name = "fake-llm"

    def __init__(self):
        self.calls = 0

    def judge(self, request):
        self.calls += 1
        return [
            PointVerdict(code="P1", awarded=True, evidence_quote="0.25 mol", reason="correct", confidence=1.0)
        ]


@pytest.fixture
def no_question_context(monkeypatch):
    # The judge request needs the question tree; the fake judge does not read it.
    monkeypatch.setattr(marking, "_judge_request", lambda answer, points: object())


def test_a_fully_confident_ai_verdict_never_becomes_a_mark(no_question_context):
    judge = AlwaysFullMarks()
    result = pending(point())
    answer = Answer(text=ANSWER_TEXT, point_results=[result])

    marking.judge_answer(answer, judge, min_confidence=0.7)

    assert judge.calls == 1
    assert result.status == PointStatus.NEEDS_REVIEW
    assert result.awarded == 0.0
    # The model's view is kept for the teacher, labelled as a suggestion.
    assert result.ai_awarded is True
    assert result.confidence == 1.0
    assert result.evidence == "0.25 mol"
    assert result.reason.startswith(marking.AI_SUGGESTION_PREFIX)


@pytest.mark.parametrize(
    "verdict",
    [
        PointVerdict(code="P1", awarded=False, evidence_quote=None, reason="missing", confidence=1.0),
        PointVerdict(code="P1", awarded=True, evidence_quote="not in the answer", reason="x", confidence=1.0),
        PointVerdict(code="P1", awarded=True, evidence_quote="0.25 mol", reason="unsure", confidence=0.1),
        None,
    ],
    ids=["confident-no", "unquoted-yes", "low-confidence", "no-verdict"],
)
def test_no_ai_verdict_decides_a_text_point(verdict):
    result = pending(point())

    marking._apply_verdict(result, verdict, ANSWER_TEXT, "fake-llm", min_confidence=0.7)

    assert result.status == PointStatus.NEEDS_REVIEW
    assert result.awarded == 0.0


@pytest.mark.parametrize("awarded", [True, False])
def test_a_confident_drawing_verdict_never_becomes_a_mark(awarded):
    result = pending(point(point_type=PointType.DIAGRAM))

    marking._apply_drawing_verdict(
        result, DrawingVerdict(awarded=awarded, reason="looks right", confidence=1.0), "fake-vlm", 0.9
    )

    assert result.status == PointStatus.NEEDS_REVIEW
    assert result.awarded == 0.0
    assert result.ai_awarded is awarded
    assert result.reason.startswith(marking.AI_SUGGESTION_PREFIX)


def test_when_the_checker_decided_the_checker_mark_stands_and_ai_agreement_adds_nothing():
    result = pending(point(), checker_awarded=True)
    agree = PointVerdict(code="P1", awarded=True, evidence_quote="0.25 mol", reason="ok", confidence=1.0)

    marking._apply_verdict(result, agree, ANSWER_TEXT, "fake-llm", min_confidence=0.7)

    assert result.status == PointStatus.AWARDED
    assert result.method == MarkingMethod.CHECKER  # the deterministic checker is the authority
    assert result.awarded == 2.0


def test_ai_disagreement_with_the_checker_only_sends_the_point_to_a_teacher():
    result = pending(point(), checker_awarded=False)
    disagree = PointVerdict(code="P1", awarded=True, evidence_quote="0.25 mol", reason="ok", confidence=1.0)

    marking._apply_verdict(result, disagree, ANSWER_TEXT, "fake-llm", min_confidence=0.7)

    assert result.status == PointStatus.NEEDS_REVIEW
    assert result.awarded == 0.0  # never raised to the AI's view


# --- official evidence: only rule / checker / teacher decisions count ----------------


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def test_ai_decided_points_from_before_grd_011_are_not_evidence(db):
    """Historical rows with method = llm and a final status must not reach mastery or
    the planner feed; rule, checker and teacher decisions must."""
    attempt = Attempt(
        id=uuid.uuid4(),
        paper_id=1,
        scheme_id=1,
        student_ref="student@school.lk",
        mode=AttemptMode.DIGITAL,
        status=AttemptStatus.MARKED,
        max_score=8,
    )
    answer = Answer(attempt=attempt, question_id=1, text=ANSWER_TEXT)
    db.add_all([attempt, answer])
    methods = [MarkingMethod.LLM, MarkingMethod.RULE, MarkingMethod.CHECKER, MarkingMethod.TEACHER]
    for i, method in enumerate(methods):
        p = MarkingPoint(
            scheme_id=1, question_id=1, code=f"P{i}", description="d", marks=2, point_type=PointType.CONCEPT
        )
        db.add(p)
        db.add(PointResult(answer=answer, point=p, status=PointStatus.AWARDED, awarded=2, method=method))
    db.commit()

    counted = {r.method for r in db.scalars(mastery.decided_points("student@school.lk"))}

    assert counted == {MarkingMethod.RULE, MarkingMethod.CHECKER, MarkingMethod.TEACHER}
