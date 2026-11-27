"""Policy for marks the pre-GRD-011 AI judge decided (operator correction 2026-11-27).

An AI-only decision is never an official mark, whatever its confidence:

- Every point a generative judge decided (method LLM, status awarded / not awarded) goes
  back to the teacher queue: NEEDS_REVIEW, 0 marks counted. The AI verdict stays on the
  point as the teacher's suggestion (ai_awarded, confidence, evidence are untouched) and
  the original status and marks are kept in the audit row.
- Confidence only sets the review priority: "high" at or below the threshold (default
  0.5) or when none was recorded, "normal" above it. It never authorises a mark.
- The attempt becomes SUBMITTED (points waiting) and keeps its previous total, shown as
  provisional, until a teacher - or a later approved deterministic checker - decides;
  review.record_decision then recomputes it.
- Until a run is applied, an attempt still holding AI-decided points is reported as
  provisional too (attempt_labels), and those points never reach mastery or the planner
  feed (TRUSTED_METHODS).

Every point a run sends is written to legacy_ai_reclassifications. Nothing is deleted. A
run is all-or-nothing (one transaction), a dry run by default, and never touches a point
an earlier unreverted run already sent; `revert_run` restores points no teacher has
decided since. Do not apply it to real student data without explicit operator approval.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Answer,
    Attempt,
    AttemptStatus,
    LegacyAiReclassification,
    MarkingMethod,
    PointResult,
    PointStatus,
    utcnow,
)
from app.services.marking import refresh_scores
from app.services.mastery import DECIDED

DEFAULT_PRIORITY_THRESHOLD = 0.5
SENT = "sent_to_review"
HIGH, NORMAL = "high", "normal"
REVIEW_NOTE = (
    "Earlier AI decision - not a validated mark. Waiting for a teacher "
    "(legacy AI-marks policy; review priority: {priority})."
)


@dataclass
class PolicyReport:
    run_id: uuid.UUID | None
    priority_threshold: float
    applied: bool
    sent_to_review: int = 0
    high_priority: int = 0
    normal_priority: int = 0
    attempts: set[uuid.UUID] = field(default_factory=set)
    students: set[str] = field(default_factory=set)

    def summary(self) -> dict[str, object]:
        return {
            "run_id": str(self.run_id) if self.run_id else None,
            "applied": self.applied,
            "priority_threshold": self.priority_threshold,
            "sent_to_review": self.sent_to_review,
            "high_priority": self.high_priority,
            "normal_priority": self.normal_priority,
            "attempts": len(self.attempts),
            "students": len(self.students),  # a count only - no identities
        }


def review_priority(confidence: float | None, threshold: float) -> str:
    """Order of review only. None counts as high: that decision was never calibrated."""
    return HIGH if confidence is None or confidence <= threshold else NORMAL


def apply_policy(
    db: Session,
    *,
    priority_threshold: float = DEFAULT_PRIORITY_THRESHOLD,
    apply: bool = False,
) -> PolicyReport:
    """Dry run by default. With apply=True, change the points and commit once."""
    if not 0 <= priority_threshold <= 1:
        raise ValueError("priority_threshold must be between 0 and 1")
    already_sent = select(LegacyAiReclassification.point_result_id).where(
        LegacyAiReclassification.action == SENT,
        LegacyAiReclassification.reverted_at.is_(None),
    )
    rows: Sequence[tuple[PointResult, Attempt]] = db.execute(
        select(PointResult, Attempt)
        .join(PointResult.answer)
        .join(Answer.attempt)
        .where(
            PointResult.method == MarkingMethod.LLM,
            PointResult.status.in_(DECIDED),
            PointResult.id.not_in(already_sent),
        )
        .options(selectinload(PointResult.point))
        .order_by(Attempt.id, PointResult.id)
    ).all()
    report = PolicyReport(
        run_id=uuid.uuid4() if apply else None, priority_threshold=priority_threshold, applied=apply
    )
    now = utcnow()
    for result, attempt in rows:
        priority = review_priority(result.confidence, priority_threshold)
        report.sent_to_review += 1
        report.high_priority += priority == HIGH
        report.normal_priority += priority == NORMAL
        report.attempts.add(attempt.id)
        report.students.add(attempt.student_ref)
        if not apply:
            continue
        db.add(
            LegacyAiReclassification(
                run_id=report.run_id,
                run_at=now,
                threshold=priority_threshold,
                point_result_id=result.id,
                attempt_id=attempt.id,
                action=SENT,
                review_priority=priority,
                previous_status=str(result.status),
                previous_awarded=result.awarded,
                previous_attempt_status=str(attempt.status),
                confidence=result.confidence,
            )
        )
        result.status = PointStatus.NEEDS_REVIEW
        result.awarded = 0.0
        result.reason = REVIEW_NOTE.format(priority=priority)
        if attempt.status == AttemptStatus.MARKED:
            # The stored total stays, as the provisional one, until refresh_scores
            # recomputes it after the review.
            attempt.status = AttemptStatus.SUBMITTED
    if apply:
        db.commit()
    return report


def revert_run(db: Session, run_id: uuid.UUID) -> int:
    """Undo a run for every point no teacher has decided since. Returns entries reverted."""
    entries = db.scalars(
        select(LegacyAiReclassification).where(
            LegacyAiReclassification.run_id == run_id,
            LegacyAiReclassification.reverted_at.is_(None),
        )
    ).all()
    reverted = 0
    touched: dict[uuid.UUID, Attempt] = {}
    now = utcnow()
    for entry in entries:
        result = db.get(PointResult, entry.point_result_id)
        if entry.action == SENT:
            if (
                result is None
                or result.method != MarkingMethod.LLM
                or result.status != PointStatus.NEEDS_REVIEW
            ):
                continue  # a teacher decided it since: their decision stands
            result.status = PointStatus(entry.previous_status)
            result.awarded = entry.previous_awarded
            result.reason = None
            touched[result.answer.attempt.id] = result.answer.attempt
        entry.reverted_at = now
        reverted += 1
    for attempt in touched.values():
        refresh_scores(attempt)
    db.commit()
    return reverted


def attempt_labels(attempt: Attempt) -> dict[str, object]:
    """What a student or teacher must be told about an attempt's total.

    A total that still counts an AI-only decision is provisional, whether or not the
    reconciliation has run yet; so is the old total of an attempt with points sent back."""
    results = [result for answer in attempt.answers for result in answer.point_results]
    ai_judged = any(r.method == MarkingMethod.LLM and r.status in DECIDED for r in results)
    waiting = sum(r.status in (PointStatus.NEEDS_REVIEW, PointStatus.PENDING) for r in results)
    reopened = attempt.status == AttemptStatus.SUBMITTED and attempt.score is not None
    return {
        "includes_ai_judged_marks": ai_judged,
        "points_awaiting_teacher": waiting if attempt.status != AttemptStatus.IN_PROGRESS else 0,
        "score_is_provisional": ai_judged or reopened,
    }
