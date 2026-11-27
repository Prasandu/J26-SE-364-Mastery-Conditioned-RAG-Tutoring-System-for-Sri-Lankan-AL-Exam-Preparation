"""Read-only inventory of marks a generative AI judge decided before GRD-011.

Since GRD-011 an AI verdict is only a suggestion for the teacher (NEEDS_REVIEW, 0 marks).
Attempts marked earlier may still hold points with method=LLM and status AWARDED or
NOT_AWARDED, and those count in the stored attempt score. This module only reports them;
it never changes a score, a point or a status. What to do about them is an operator
decision (docs/engineering/LEGACY_AI_MARKS_RECONCILIATION.md).
"""

import hashlib
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Answer, Attempt, MarkingMethod, PointResult, PointStatus
from app.services.mastery import DECIDED


@dataclass(frozen=True)
class LegacyAttempt:
    attempt_id: str
    student: str  # pseudonym: sha256 of the account reference, first 12 hex digits
    paper_id: int
    status: str
    marked_at: datetime | None
    stored_score: float | None
    max_score: float | None
    ai_points: int  # points an AI judge decided (awarded or not awarded)
    ai_awarded_marks: float  # marks those points contribute before question caps / best-of-N
    ai_not_awarded_points: int  # an AI judge withheld marks here; a teacher may award them


def pseudonym(student_ref: str) -> str:
    return hashlib.sha256(student_ref.encode("utf-8")).hexdigest()[:12]


def legacy_ai_attempts(db: Session) -> list[LegacyAttempt]:
    """Every attempt with at least one AI-decided point, oldest marking first.

    ai_awarded_marks is an upper bound on how much the stored score would fall without
    them: question caps and "best N of M" sections can make the real difference smaller."""
    rows = db.execute(
        select(PointResult, Attempt)
        .join(PointResult.answer)
        .join(Answer.attempt)
        .where(PointResult.method == MarkingMethod.LLM, PointResult.status.in_(DECIDED))
        .options(selectinload(PointResult.point))
    ).all()
    by_attempt: dict[object, list[PointResult]] = defaultdict(list)
    attempts: dict[object, Attempt] = {}
    for result, attempt in rows:
        by_attempt[attempt.id].append(result)
        attempts[attempt.id] = attempt
    report = []
    for attempt_id, results in by_attempt.items():
        attempt = attempts[attempt_id]
        report.append(
            LegacyAttempt(
                attempt_id=str(attempt.id),
                student=pseudonym(attempt.student_ref),
                paper_id=attempt.paper_id,
                status=str(attempt.status),
                marked_at=attempt.marked_at,
                stored_score=attempt.score,
                max_score=attempt.max_score,
                ai_points=len(results),
                ai_awarded_marks=sum(r.awarded for r in results if r.status == PointStatus.AWARDED),
                ai_not_awarded_points=sum(1 for r in results if r.status == PointStatus.NOT_AWARDED),
            )
        )
    return sorted(
        report, key=lambda row: (row.marked_at is None, row.marked_at or datetime.min, row.attempt_id)
    )
