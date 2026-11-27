"""The operator's policy for marks the pre-GRD-011 AI judge decided (decision 2026-11-27):

- AI confidence at or below the threshold (default 0.5), or no confidence recorded: the
  point goes back to the teacher queue (NEEDS_REVIEW, 0 marks). The AI verdict stays as
  the teacher's suggestion (ai_awarded, evidence, confidence are untouched). The attempt
  becomes SUBMITTED - some points waiting - and keeps its previous total, shown as
  provisional, until a teacher decides (review.record_decision recomputes it).
- Above the threshold: the decision stays and the attempt is labelled as including
  AI-judged marks (AttemptOut.includes_ai_judged_marks). It still never reaches mastery
  or the planner feed (TRUSTED_METHODS).

Every point a run looks at is written to legacy_ai_reclassifications. Nothing is deleted.
A run is all-or-nothing (one transaction) and only touches points not seen by an earlier
run; `revert_run` restores points no teacher has decided since.
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

DEFAULT_THRESHOLD = 0.5
SENT = "sent_to_review"
KEPT = "kept_labelled"
REVIEW_NOTE = "Earlier AI decision with low confidence - sent back for a teacher (legacy AI-marks policy)."


@dataclass
class PolicyReport:
    run_id: uuid.UUID | None
    threshold: float
    applied: bool
    sent_to_review: int = 0
    kept_labelled: int = 0
    attempts: set[uuid.UUID] = field(default_factory=set)
    students: set[str] = field(default_factory=set)

    def summary(self) -> dict[str, object]:
        return {
            "run_id": str(self.run_id) if self.run_id else None,
            "applied": self.applied,
            "threshold": self.threshold,
            "sent_to_review": self.sent_to_review,
            "kept_labelled": self.kept_labelled,
            "attempts": len(self.attempts),
            "students": len(self.students),  # a count only - no identities
        }


def goes_to_review(confidence: float | None, threshold: float) -> bool:
    """None counts as low: an AI decision without a confidence was never calibrated."""
    return confidence is None or confidence <= threshold


def apply_policy(db: Session, *, threshold: float = DEFAULT_THRESHOLD, apply: bool = False) -> PolicyReport:
    """Dry run by default. With apply=True, change the points and commit once."""
    if not 0 <= threshold <= 1:
        raise ValueError("threshold must be between 0 and 1")
    already = select(LegacyAiReclassification.point_result_id).where(
        LegacyAiReclassification.reverted_at.is_(None)
    )
    rows: Sequence[tuple[PointResult, Attempt]] = db.execute(
        select(PointResult, Attempt)
        .join(PointResult.answer)
        .join(Answer.attempt)
        .where(
            PointResult.method == MarkingMethod.LLM,
            PointResult.status.in_(DECIDED),
            PointResult.id.not_in(already),
        )
        .options(selectinload(PointResult.point))
        .order_by(Attempt.id, PointResult.id)
    ).all()
    report = PolicyReport(run_id=uuid.uuid4() if apply else None, threshold=threshold, applied=apply)
    now = utcnow()
    for result, attempt in rows:
        action = SENT if goes_to_review(result.confidence, threshold) else KEPT
        report.attempts.add(attempt.id)
        report.students.add(attempt.student_ref)
        if action == SENT:
            report.sent_to_review += 1
        else:
            report.kept_labelled += 1
        if not apply:
            continue
        db.add(
            LegacyAiReclassification(
                run_id=report.run_id,
                run_at=now,
                threshold=threshold,
                point_result_id=result.id,
                attempt_id=attempt.id,
                action=action,
                previous_status=str(result.status),
                previous_awarded=result.awarded,
                previous_attempt_status=str(attempt.status),
                confidence=result.confidence,
            )
        )
        if action == SENT:
            result.status = PointStatus.NEEDS_REVIEW
            result.awarded = 0.0
            result.reason = REVIEW_NOTE
            if attempt.status == AttemptStatus.MARKED:
                # Some points wait for a teacher again; the stored total stays as the
                # provisional one until refresh_scores recomputes it after the review.
                attempt.status = AttemptStatus.SUBMITTED
    if apply:
        db.commit()
    return report


def revert_run(db: Session, run_id: uuid.UUID) -> int:
    """Undo a run for every point no teacher has decided since. Returns points restored."""
    entries = db.scalars(
        select(LegacyAiReclassification).where(
            LegacyAiReclassification.run_id == run_id,
            LegacyAiReclassification.reverted_at.is_(None),
        )
    ).all()
    restored = 0
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
        restored += 1
    for attempt in touched.values():
        refresh_scores(attempt)
    db.commit()
    return restored


def attempt_labels(attempt: Attempt) -> dict[str, object]:
    """What a student or teacher must be told about an attempt's total."""
    results = [result for answer in attempt.answers for result in answer.point_results]
    ai_judged = any(r.method == MarkingMethod.LLM and r.status in DECIDED for r in results)
    waiting = sum(r.status in (PointStatus.NEEDS_REVIEW, PointStatus.PENDING) for r in results)
    provisional = attempt.status == AttemptStatus.SUBMITTED and attempt.score is not None
    return {
        "includes_ai_judged_marks": ai_judged,
        "points_awaiting_teacher": waiting if attempt.status != AttemptStatus.IN_PROGRESS else 0,
        "score_is_provisional": provisional,
    }
