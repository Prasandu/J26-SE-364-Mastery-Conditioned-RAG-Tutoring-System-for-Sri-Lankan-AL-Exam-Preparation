"""Teacher review: the queue of undecided marking points, and the teacher's own decision.

A teacher may review any point of a submitted attempt, not only the ones the machine
could not decide. Their decision is stored beside the machine markers' own decisions
(`checker_awarded`, `ai_awarded`), so how often each marker agrees with a teacher can
be measured - the reference standard this project is evaluated against.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy import Select, select
from sqlalchemy.orm import Session, selectinload

from app.errors import ConflictError, NotFoundError
from app.models import (
    Answer,
    Attempt,
    AttemptStatus,
    MarkingMethod,
    PointResult,
    PointReview,
    PointStatus,
    utcnow,
)
from app.schemas.attempts import GraphIn
from app.schemas.review import (
    AgreementOut,
    MarkerAgreement,
    ReviewDecisionIn,
    ReviewItemOut,
    ReviewScriptOut,
)
from app.services.marking import question_with_context, refresh_scores

MAX_QUEUE_PAGE = 200
# Pending points need a human too, or they sit unseen when the AI judge is off.
UNRESOLVED = (PointStatus.NEEDS_REVIEW, PointStatus.PENDING)


def review_queue(
    db: Session,
    *,
    paper_id: int | None = None,
    status: PointStatus | None = None,
    limit: int = 50,
    offset: int = 0,
) -> Sequence[PointResult]:
    """Points waiting for a teacher, oldest submission first so nobody waits too long.

    Without `status`, every point no marker has settled is listed.
    """
    chosen = PointResult.status == status if status else PointResult.status.in_(UNRESOLVED)
    stmt = (
        _submitted_points()
        .where(chosen)
        .order_by(Attempt.submitted_at, PointResult.id)
        .limit(min(limit, MAX_QUEUE_PAGE))
        .offset(offset)
    )
    if paper_id is not None:
        stmt = stmt.where(Attempt.paper_id == paper_id)
    return db.scalars(stmt).all()


def review_scripts(
    db: Session, *, paper_id: int | None = None, limit: int = 50, offset: int = 0
) -> list[ReviewScriptOut]:
    """Submitted scripts a teacher can mark, oldest first, with how many points are done.

    This is for marking a whole script point by point, not only the points the machine
    could not settle. Agreement can only be measured on points a teacher also judged,
    and the interesting cases are the ones the machine was confidently wrong about.
    """
    stmt = (
        select(Attempt)
        .where(Attempt.status != AttemptStatus.IN_PROGRESS)
        .order_by(Attempt.submitted_at, Attempt.id)
        .limit(min(limit, MAX_QUEUE_PAGE))
        .offset(offset)
        # Each script counts its own marking points, which is a query each without this.
        .options(selectinload(Attempt.answers).selectinload(Answer.point_results))
    )
    if paper_id is not None:
        stmt = stmt.where(Attempt.paper_id == paper_id)

    scripts = []
    for attempt in db.scalars(stmt):
        results = [r for answer in attempt.answers for r in answer.point_results]
        scripts.append(
            ReviewScriptOut(
                attempt_id=attempt.id,
                student_ref=attempt.student_ref,
                paper_id=attempt.paper_id,
                paper_title=attempt.paper.title,
                submitted_at=attempt.submitted_at,
                total_points=len(results),
                reviewed_points=sum(r.teacher_awarded is not None for r in results),
                machine_score=attempt.score,
                max_score=attempt.max_score,
            )
        )
    return scripts


def get_point(db: Session, result_id: int) -> PointResult:
    result = db.get(PointResult, result_id)
    if result is None:
        raise NotFoundError("Marking point not found")
    if result.answer.attempt.status == AttemptStatus.IN_PROGRESS:
        raise ConflictError("This attempt has not been submitted yet")
    return result


def record_decision(db: Session, result_id: int, decision: ReviewDecisionIn) -> PointResult:
    """The teacher's decision is final and replaces whatever the machine decided.

    The earlier decision is not lost: every one is appended to point_reviews, so a
    changed mind or a second marker can still be reported.
    """
    result = get_point(db, result_id)
    result.reviews.append(
        PointReview(
            awarded=decision.awarded,
            comment=decision.comment,
            teacher_ref=decision.teacher_ref,
            saw_machine=decision.saw_machine,
        )
    )
    result.teacher_awarded = decision.awarded
    result.teacher_comment = decision.comment
    result.reviewed_by = decision.teacher_ref
    result.reviewed_at = utcnow()
    result.teacher_saw_machine = decision.saw_machine
    result.status = PointStatus.AWARDED if decision.awarded else PointStatus.NOT_AWARDED
    result.awarded = result.point.marks if decision.awarded else 0.0
    result.method = MarkingMethod.TEACHER
    result.marker = decision.teacher_ref
    result.confidence = 1.0

    refresh_scores(result.answer.attempt)
    db.commit()
    return result


def agreement(db: Session, *, paper_id: int | None = None) -> AgreementOut:
    """How often each machine marker reached the same decision as the teacher."""
    stmt = _submitted_points().where(PointResult.teacher_awarded.is_not(None))
    if paper_id is not None:
        stmt = stmt.where(Attempt.paper_id == paper_id)
    reviewed = db.scalars(stmt).all()
    # Compared with False, not falsy: a NULL means the decision was made before blind
    # review existed and cannot be claimed as one. Counting unknown as blind would
    # quietly inflate the figure this project reports.
    blind = [r for r in reviewed if r.teacher_saw_machine is False]

    return AgreementOut(
        reviewed_points=len(reviewed),
        checker_vs_teacher=_compare(reviewed, "checker_awarded", "teacher_awarded"),
        ai_vs_teacher=_compare(reviewed, "ai_awarded", "teacher_awarded"),
        checker_vs_ai=_compare(reviewed, "checker_awarded", "ai_awarded"),
        blind_points=len(blind),
        blind_checker_vs_teacher=_compare(blind, "checker_awarded", "teacher_awarded"),
        blind_ai_vs_teacher=_compare(blind, "ai_awarded", "teacher_awarded"),
    )


def to_review_item(result: PointResult) -> ReviewItemOut:
    answer = result.answer
    attempt = answer.attempt
    question = answer.question
    model_answer = next(
        (m.answer_text for m in attempt.scheme.model_answers if m.question_id == question.id), None
    )
    return ReviewItemOut(
        id=result.id,
        attempt_id=attempt.id,
        student_ref=attempt.student_ref,
        submitted_at=attempt.submitted_at,
        paper_title=attempt.paper.title,
        section=question.section.code,
        question=question.full_label,
        question_text=question_with_context(question),
        model_answer=model_answer,
        code=result.point.code,
        description=result.point.description,
        marks=result.point.marks,
        student_text=answer.text,
        student_extracted_text=answer.extracted_text,
        corrected_by_student=answer.corrected_by_student,
        read_by=answer.reader,
        student_mcq_option=answer.mcq_option,
        student_graph=GraphIn.model_validate(answer.data) if answer.data else None,
        status=result.status,
        checker_awarded=result.checker_awarded,
        ai_awarded=result.ai_awarded,
        machine_evidence=result.evidence,
        machine_reason=result.reason,
        confidence=result.confidence,
        marker=result.marker,
    )


def _submitted_points() -> Select[tuple[PointResult]]:
    """Points of attempts that are no longer being answered, joined ready for filtering."""
    return (
        select(PointResult)
        .join(PointResult.answer)
        .join(Answer.attempt)
        .where(Attempt.status != AttemptStatus.IN_PROGRESS)
    )


def _compare(results: Sequence[PointResult], left: str, right: str) -> MarkerAgreement:
    both = [r for r in results if getattr(r, left) is not None and getattr(r, right) is not None]
    agree = sum(getattr(r, left) == getattr(r, right) for r in both)
    return MarkerAgreement(
        judged=len(both),
        agree=agree,
        disagree=len(both) - agree,
        agreement_pct=round(100 * agree / len(both), 1) if both else None,
    )


def attempt_points(db: Session, attempt_id: uuid.UUID) -> Sequence[PointResult]:
    """Every marking point of one attempt, so a teacher can double-mark the whole script."""
    stmt = _submitted_points().where(Attempt.id == attempt_id).order_by(PointResult.id)
    results = db.scalars(stmt).all()
    if not results:
        raise NotFoundError("No submitted attempt with that id")
    return results
