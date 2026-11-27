"""What the other 3 components of this group project (J26-SE-364) read about a
student: topic performance, answer-mode breakdown and error categories, plus an
incremental feed of newly-marked points. Read-only - see app/api/integration.py
for the routes and docs/integration-contract.md for the shape this returns.
"""

import base64
import binascii
import json
import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, case, or_, select
from sqlalchemy.orm import Session, selectinload

from app.errors import ContentValidationError
from app.models import (
    Answer,
    Attempt,
    AttemptStatus,
    MarkingMethod,
    Paper,
    PointResult,
    PointStatus,
    Question,
    User,
    utcnow,
)
from app.schemas.integration import (
    AnswerModeSummaryOut,
    ErrorCategoryOut,
    FinalizedEventOut,
    FinalizedEventsOut,
    FinalizedScoreOut,
    MasteryEventOut,
    StudentEventsOut,
    StudentProfileOut,
    TopicPerformanceOut,
)
from app.services.mastery import DECIDED, TRUSTED_METHODS
from app.services.mastery import decided_points as _decided_points

DEFAULT_EVENTS_WINDOW = timedelta(hours=24)


def resolve_student_ref(db: Session, student_ref: str) -> str:
    """The ref attempts are stored under (the account's email) for what a caller
    sends: the other components know a student by the shared Supabase Auth user id
    (see app/services/supabase_auth.py), so a linked account's id is translated here.
    Anything else is used as given, as before."""
    user = db.scalar(select(User).where(User.supabase_user_id == student_ref))
    return user.email if user is not None else student_ref


def student_profile(db: Session, student_ref: str) -> StudentProfileOut:
    requested_ref = student_ref
    student_ref = resolve_student_ref(db, student_ref)
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
        student_ref=requested_ref,
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
    requested_ref = student_ref
    student_ref = resolve_student_ref(db, student_ref)
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
    return StudentEventsOut(student_ref=requested_ref, as_of=utcnow(), events=events)


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


# DAT-010: the finalized-mark feed the planner pulls (assessment.criterion.finalized v1).
EVENT_NAMESPACE = uuid.UUID("5b0f0c34-6a8e-4c2b-9d1f-2a7e3c4b5d6e")
DETERMINISTIC = (MarkingMethod.RULE, MarkingMethod.CHECKER)


def finalized_events(
    db: Session, since: datetime | None, limit: int = 500, after: str | None = None
) -> FinalizedEventsOut:
    """Every official decision finalized since `since` (default: the last 24 hours), oldest
    first, for students whose account is linked to the shared Supabase user (others have no
    cross-component identity and are left out).

    Only rule, checker and teacher decisions (TRUSTED_METHODS - never a generative model),
    only on marked attempts, and never on practice papers (model-written schemes). A
    teacher decision after marking is a new source_version of the same point, so the event
    ids are stable across re-reads and a correction supersedes by source_entity_id.

    Ordered by (final-decision time, point result id) - a keyset, so paging with `after`
    neither skips nor repeats a decision, even when one attempt has more points than `limit`."""
    cutoff = since or (utcnow() - DEFAULT_EVENTS_WINDOW)
    decided_at = case(
        (
            and_(PointResult.reviewed_at.is_not(None), PointResult.reviewed_at > Attempt.marked_at),
            PointResult.reviewed_at,
        ),
        else_=Attempt.marked_at,
    )
    page_filter = []
    if after is not None:
        after_at, after_id = decode_cursor(after)
        page_filter.append(
            or_(decided_at > after_at, and_(decided_at == after_at, PointResult.id > after_id))
        )
    stmt = (
        select(PointResult, Attempt, User)
        .join(PointResult.answer)
        .join(Answer.attempt)
        .join(Attempt.paper)
        .join(User, User.email == Attempt.student_ref)
        .where(
            User.supabase_user_id.is_not(None),
            Attempt.status == AttemptStatus.MARKED,
            Paper.created_by.is_(None),
            PointResult.status.in_(DECIDED),
            PointResult.method.in_(TRUSTED_METHODS),
            decided_at >= cutoff,
            *page_filter,
        )
        .options(
            selectinload(PointResult.point),
            selectinload(PointResult.reviews),
            selectinload(PointResult.answer).selectinload(Answer.question).selectinload(Question.topics),
        )
        .order_by(decided_at, PointResult.id)
        .limit(limit + 1)
    )
    rows = db.execute(stmt).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    events = []
    for result, attempt, user in rows:
        version = len(result.reviews) if result.method == MarkingMethod.TEACHER else 0
        entity = f"attempt/{attempt.id}/point/{result.point.code}"
        occurred = max(_utc(t) for t in (attempt.marked_at, result.reviewed_at) if t is not None)
        events.append(
            FinalizedEventOut(
                event_id=uuid.uuid5(EVENT_NAMESPACE, f"{entity}#{version}"),
                subject_user_id=user.supabase_user_id,
                source_entity_id=entity,
                source_version=version,
                source_topic_codes=[topic.code for topic in result.answer.question.topics],
                evidence_class="deterministic" if result.method in DETERMINISTIC else "teacher_verified",
                score=FinalizedScoreOut(awarded=result.awarded, maximum=result.point.marks),
                paper_id=attempt.paper_id,
                assessed_at=_utc(attempt.submitted_at or attempt.marked_at),
                occurred_at=occurred,
            )
        )
    next_cursor = after
    if rows:
        last_result, last_attempt, _ = rows[-1]
        last_at = max(_utc(t) for t in (last_attempt.marked_at, last_result.reviewed_at) if t is not None)
        next_cursor = encode_cursor(last_at, last_result.id)
    return FinalizedEventsOut(as_of=utcnow(), events=events, next_cursor=next_cursor, has_more=has_more)


def encode_cursor(decided_at: datetime, point_result_id: int) -> str:
    raw = json.dumps({"t": _utc(decided_at).isoformat(), "id": point_result_id}, separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, int]:
    """The inverse of encode_cursor; anything else is a client error, never a silent restart."""
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode()))
        decided_at = datetime.fromisoformat(data["t"])
        point_result_id = data["id"]
        if decided_at.tzinfo is None or not isinstance(point_result_id, int) or point_result_id < 0:
            raise ValueError
    except (ValueError, KeyError, TypeError, binascii.Error) as exc:
        raise ContentValidationError("Invalid events cursor") from exc
    # Bound as naive UTC on SQLite (which stores naive values) and aware on Postgres: both
    # compare correctly, because every stored time is UTC.
    return decided_at.astimezone(UTC), point_result_id


def _utc(moment: datetime) -> datetime:
    """Postgres returns aware datetimes, SQLite (the local fallback) naive UTC ones."""
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)
