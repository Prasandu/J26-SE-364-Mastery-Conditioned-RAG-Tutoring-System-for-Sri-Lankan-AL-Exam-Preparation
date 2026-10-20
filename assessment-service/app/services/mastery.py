"""Per-student, per-topic mastery: how often a student's own attempts have earned
points tagged with each syllabus topic.

Every attempt and point result already carries what this needs - this module just
turns that into the one number a student, or the practice generator, can act on. A
topic the student has never attempted is reported separately from one they attempted
and did badly on: there is no evidence of weakness in the first case, only of gap,
but both are exactly what "practice your weak topics" should surface first.

app.services.integration reuses decided_points() below for the same underlying
query, reported externally in its own shape (see docs/integration-contract.md) -
this module owns the query once rather than each maintaining its own copy.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import Select, select
from sqlalchemy.orm import Session, selectinload

from app.models import Answer, Attempt, PointResult, PointStatus, Question, Topic

DECIDED = (PointStatus.AWARDED, PointStatus.NOT_AWARDED)


@dataclass(frozen=True)
class TopicMastery:
    topic_code: str
    topic_name: str
    points_total: int
    points_awarded: float
    accuracy_pct: float | None  # None = never attempted - weaker than any score, not a 0%
    last_attempt_at: datetime | None


def decided_points(student_ref: str) -> Select[tuple[PointResult]]:
    """Every point of this student's that has an actual decision (not still pending
    or waiting on a teacher)."""
    return (
        select(PointResult)
        .join(PointResult.answer)
        .join(Answer.attempt)
        .where(Attempt.student_ref == student_ref, PointResult.status.in_(DECIDED))
        .options(
            selectinload(PointResult.answer).selectinload(Answer.attempt),
            selectinload(PointResult.answer)
            .selectinload(Answer.question)
            .selectinload(Question.section),
            selectinload(PointResult.answer).selectinload(Answer.question).selectinload(Question.topics),
            selectinload(PointResult.point),
        )
    )


def student_mastery(db: Session, student_ref: str) -> list[TopicMastery]:
    """Every topic a question can actually be tagged with, weakest first.

    "Weakest first" puts a never-attempted topic ahead of one the student attempted
    and got half right, since there is nothing to weigh the never-attempted one
    against - treating it as merely average would hide a real gap.
    """
    by_topic: dict[str, list[PointResult]] = defaultdict(list)
    names: dict[str, str] = {}
    for result in db.scalars(decided_points(student_ref)):
        for topic in result.answer.question.topics:
            by_topic[topic.code].append(result)
            names[topic.code] = topic.name

    attempted = {code: _mastery(code, results, names) for code, results in by_topic.items()}

    all_topics = db.scalars(select(Topic)).all()
    # A topic only ever used to group others (it has children) is never itself
    # tagged on a question, so it can never be "attempted" - excluded here rather
    # than reported as a permanently weak topic nobody could ever practice directly.
    parent_ids = {topic.parent_id for topic in all_topics if topic.parent_id is not None}
    never_attempted = [
        TopicMastery(topic.code, topic.name, 0, 0.0, None, None)
        for topic in all_topics
        if topic.code not in attempted and topic.id not in parent_ids
    ]

    return sorted(
        [*never_attempted, *attempted.values()],
        key=lambda mastery: (mastery.accuracy_pct is not None, mastery.accuracy_pct or 0),
    )


def _mastery(code: str, results: list[PointResult], names: dict[str, str]) -> TopicMastery:
    attempted_at = [r.answer.attempt.submitted_at for r in results if r.answer.attempt.submitted_at]
    return TopicMastery(
        topic_code=code,
        topic_name=names[code],
        points_total=len(results),
        points_awarded=sum(r.awarded for r in results),
        accuracy_pct=round(100 * sum(r.awarded > 0 for r in results) / len(results), 1),
        last_attempt_at=max(attempted_at) if attempted_at else None,
    )
