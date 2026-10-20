"""What the other 3 components of this group project (J26-SE-364) read about a
student: topic performance, answer-mode breakdown and error categories, plus an
incremental feed of newly-marked points. Read-only - see app/api/integration.py
for the routes and docs/integration-contract.md for the shape this returns.
"""

from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Attempt, AttemptStatus, PointResult, PointStatus, utcnow
from app.schemas.integration import (
    AnswerModeSummaryOut,
    ErrorCategoryOut,
    MasteryEventOut,
    StudentEventsOut,
    StudentProfileOut,
    TopicPerformanceOut,
)
from app.services.mastery import decided_points as _decided_points

DEFAULT_EVENTS_WINDOW = timedelta(hours=24)


def student_profile(db: Session, student_ref: str) -> StudentProfileOut:
    by_topic: dict[str, list[PointResult]] = defaultdict(list)
    by_mode: dict[str, list[PointResult]] = defaultdict(list)
    by_point_type: dict[str, list[PointResult]] = defaultdict(list)
    topic_names: dict[str, str] = {}

    for result in db.scalars(_decided_points(student_ref)):
        question = result.answer.question
        for topic in question.topics:
            by_topic[topic.code].append(result)
            topic_names[topic.code] = topic.name
        by_mode[question.section.answer_mode.value].append(result)
        by_point_type[result.point.point_type.value].append(result)

    topic_performance = [_topic_performance(code, results, topic_names) for code, results in by_topic.items()]

    by_answer_mode = [
        AnswerModeSummaryOut(
            answer_mode=mode,
            attempts=len({r.answer.attempt_id for r in results}),
            average_percent=_average_percent(results),
        )
        for mode, results in by_mode.items()
    ]

    error_categories = [
        ErrorCategoryOut(
            point_type=point_type,
            missed=sum(1 for r in results if r.status == PointStatus.NOT_AWARDED),
            total=len(results),
        )
        for point_type, results in by_point_type.items()
    ]

    attempts = db.scalars(select(Attempt).where(Attempt.student_ref == student_ref)).all()
    return StudentProfileOut(
        student_ref=student_ref,
        generated_at=utcnow(),
        topic_performance=topic_performance,
        by_answer_mode=by_answer_mode,
        error_categories=error_categories,
        attempts_total=len(attempts),
        attempts_marked=sum(1 for a in attempts if a.status == AttemptStatus.MARKED),
        attempts_needing_review=sum(
            1 for a in attempts if a.status == AttemptStatus.SUBMITTED and a.marked_at is None
        ),
    )


def student_events(db: Session, student_ref: str, since: datetime | None) -> StudentEventsOut:
    """Every decided point of an attempt marked since `since` (default: the last
    24 hours) - one batch per attempt, since a point has no timestamp of its own.
    See MasteryEventOut.marked_at."""
    cutoff = since or (utcnow() - DEFAULT_EVENTS_WINDOW)
    stmt = _decided_points(student_ref).where(
        Attempt.status == AttemptStatus.MARKED, Attempt.marked_at >= cutoff
    )

    events = [
        MasteryEventOut(
            attempt_id=result.answer.attempt.id,
            paper_id=result.answer.attempt.paper_id,
            paper_title=result.answer.attempt.paper.title,
            section=result.answer.question.section.code,
            question_id=result.answer.question.id,
            question_label=result.answer.question.full_label,
            topic_codes=[t.code for t in result.answer.question.topics],
            point_code=result.point.code,
            point_type=result.point.point_type,
            marks=result.point.marks,
            awarded=result.awarded,
            status=result.status,
            answer_mode=result.answer.question.section.answer_mode,
            marked_at=result.answer.attempt.marked_at,
        )
        for result in db.scalars(stmt)
    ]
    return StudentEventsOut(student_ref=student_ref, as_of=utcnow(), events=events)


def _topic_performance(
    code: str, results: list[PointResult], topic_names: dict[str, str]
) -> TopicPerformanceOut:
    attempted_at = [r.answer.attempt.submitted_at for r in results if r.answer.attempt.submitted_at]
    return TopicPerformanceOut(
        topic_code=code,
        topic_name=topic_names[code],
        points_total=len(results),
        points_awarded=sum(r.awarded for r in results),
        accuracy_pct=round(100 * sum(r.awarded > 0 for r in results) / len(results), 1),
        last_attempt_at=max(attempted_at) if attempted_at else None,
    )


def _average_percent(results: list[PointResult]) -> float | None:
    by_attempt: dict = defaultdict(lambda: [0.0, 0.0])
    for r in results:
        totals = by_attempt[r.answer.attempt_id]
        totals[0] += r.awarded
        totals[1] += r.point.marks
    percents = [100 * got / max_marks for got, max_marks in by_attempt.values() if max_marks]
    return round(sum(percents) / len(percents), 1) if percents else None
