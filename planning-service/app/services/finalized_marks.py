"""DAT-010 consumer: finalized assessment marks -> planner mastery evidence.

Each feed event is one finalized official decision on one marking point
(assessment.criterion.finalized v1). Rules, in the order they are checked:

1. Malformed events, an id reused with different content, a point that already belongs to
   another student, or an id another evidence source already used are rejected
   (integration_rejections) - never applied, never fatal to the rest of the page.
2. The same event again is a duplicate: no change.
3. Per assessment point (source_entity_id) only the highest source_version counts. An older
   version arriving later is `stale` and never applied, so a replay cannot undo a teacher's
   correction. A newer version supersedes the older one: its TopicEvidence is removed (the
   ledger row and RawEvent stay for audit) before the new marks are added, so a corrected
   point never counts twice.
4. Only official non-generative marks (evidence_class deterministic / teacher_verified)
   become evidence; anything else is `legacy_unverified`.
5. Topic codes map only through approved aliases in the reviewed registry (DAT-009). Any
   unmapped code quarantines the whole event, with the reason; release_quarantined applies
   it once the mapping is approved.
6. The student is the event's subject_user_id (the producer's linked Supabase id), never a
   value from a planner request.

Nothing here commits: the caller commits a page together with its cursor, or rolls both back.
"""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AssessmentDecision,
    IntegrationRejection,
    LearnerTopicState,
    RawEvent,
    StudyPlan,
    Topic,
    TopicEvidence,
)
from app.schemas.finalized_marks import (
    TRUSTED_EVIDENCE_CLASSES,
    FinalizedMarkEvent,
    PullReport,
    QuarantinedCode,
    QuarantineSummary,
)
from app.services.mastery import recompute_for
from app.services.roadmap import rolling_state, set_rolling_state
from app.services.rolling import PENDING_ASSESSMENT_EVIDENCE as PENDING_KEY
from app.services.topic_registry import Quarantined, TopicRegistry
from app.services.weights import FINALIZED_MARK_REPLAN_EPSILON

SOURCE = "assessment-service"
EVENT_TYPE = "assessment.criterion.finalized"
REGISTRY_SOURCE = "assessment"
DEFAULT_DIFFICULTY = 0.5  # the feed carries no item difficulty
LIVE_OLDER_STATUSES = ("applied", "quarantined", "legacy_unverified")


@dataclass
class _Batch:
    report: PullReport
    now: datetime
    touched: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    fingerprints: set[str] = field(default_factory=set)


def ingest_finalized_events(
    session: Session,
    items: Sequence[Any],
    registry: TopicRegistry,
    *,
    now: datetime | None = None,
    report: PullReport | None = None,
) -> PullReport:
    """Apply one page of feed events, then refresh mastery once per touched student/topic."""
    batch = _Batch(report or PullReport(), _utc(now))
    for raw in items:
        _ingest_one(session, raw, registry, batch)
        session.flush()
    _refresh_mastery(session, batch)
    return batch.report


def release_quarantined(
    session: Session,
    registry: TopicRegistry,
    *,
    now: datetime | None = None,
) -> PullReport:
    """Apply quarantined events whose codes all map now (after a reviewer approved aliases).

    A quarantined row is always the newest version of its point: a newer arrival marks it
    superseded. Rows still unmapped keep waiting, with an updated reason."""
    batch = _Batch(PullReport(), _utc(now))
    rows = session.scalars(
        select(AssessmentDecision)
        .where(AssessmentDecision.status == "quarantined")
        .order_by(AssessmentDecision.occurred_at, AssessmentDecision.event_id)
    ).all()
    for decision in rows:
        topic_ids, problems = resolve_topics(session, registry, decision.source_topic_codes)
        if problems:
            decision.reason = _reason(problems)
            continue
        _apply(session, decision, topic_ids, batch)
        batch.report.released += 1
        session.flush()
    _refresh_mastery(session, batch)
    return batch.report


def resolve_topics(
    session: Session,
    registry: TopicRegistry,
    codes: Sequence[str],
) -> tuple[list[str], list[str]]:
    """Canonical topic ids for assessment codes, or the problems that block them."""
    if not codes:
        return [], ["the question has no topic codes"]
    topic_ids: list[str] = []
    problems: list[str] = []
    for code in codes:
        resolved = registry.resolve(REGISTRY_SOURCE, code)
        if isinstance(resolved, Quarantined):
            problems.append(f"{code}: {resolved.reason}")
        elif session.get(Topic, resolved.topic_id) is None:
            problems.append(f"{code}: topic {resolved.topic_id} is not seeded in the planner")
        elif resolved.topic_id not in topic_ids:
            topic_ids.append(resolved.topic_id)
    return topic_ids, problems


def quarantine_summary(session: Session, registry: TopicRegistry) -> QuarantineSummary:
    """What needs review: unmapped codes with event and student counts (no student ids)."""
    quarantined = session.scalars(
        select(AssessmentDecision).where(AssessmentDecision.status == "quarantined")
    ).all()
    events: dict[str, int] = defaultdict(int)
    students: dict[str, set[str]] = defaultdict(set)
    for decision in quarantined:
        for code in decision.source_topic_codes:
            if isinstance(registry.resolve(REGISTRY_SOURCE, code), Quarantined):
                events[code] += 1
                students[code].add(decision.subject_user_id)
    legacy = session.scalar(
        select(func.count())
        .select_from(AssessmentDecision)
        .where(AssessmentDecision.status == "legacy_unverified")
    )
    rejected = session.scalar(
        select(func.count()).select_from(IntegrationRejection).where(IntegrationRejection.source == SOURCE)
    )
    return QuarantineSummary(
        quarantined_events=len(quarantined),
        legacy_unverified_events=int(legacy or 0),
        rejected_events=int(rejected or 0),
        unmapped_codes=[
            QuarantinedCode(code=code, events=events[code], students=len(students[code]))
            for code in sorted(events)
        ],
    )


def _ingest_one(session: Session, raw: Any, registry: TopicRegistry, batch: _Batch) -> None:
    if not isinstance(raw, Mapping):
        _reject(session, None, {"value": repr(raw)[:200]}, "invalid_event: not an object", batch)
        return
    try:
        event = FinalizedMarkEvent.model_validate(raw)
    except ValidationError as exc:
        _reject(session, raw.get("event_id"), dict(raw), f"invalid_event: {_summary(exc)}", batch)
        return

    canonical = event.model_dump(mode="json")
    event_id = str(event.event_id)
    subject = str(event.subject_user_id)
    if batch.report.high_water is None or event.occurred_at > batch.report.high_water:
        batch.report.high_water = event.occurred_at

    existing = session.get(AssessmentDecision, event_id)
    if existing is not None:
        if existing.payload == canonical:
            batch.report.duplicates += 1
        else:
            _reject(session, event_id, canonical, "conflicting_event_id: same id, different content", batch)
        return
    if session.get(RawEvent, event_id) is not None:
        _reject(session, event_id, canonical, "event_id_in_use: another evidence source used this id", batch)
        return

    versions = session.scalars(
        select(AssessmentDecision).where(AssessmentDecision.source_entity_id == event.source_entity_id)
    ).all()
    if any(version.subject_user_id != subject for version in versions):
        _reject(
            session,
            event_id,
            canonical,
            "subject_mismatch: this assessment point already belongs to another student",
            batch,
        )
        return

    decision = AssessmentDecision(
        event_id=event_id,
        source_entity_id=event.source_entity_id,
        source_version=event.source_version,
        subject_user_id=subject,
        evidence_class=event.evidence_class,
        source_topic_codes=list(event.source_topic_codes),
        topic_ids=[],
        score_awarded=event.score.awarded,
        score_maximum=event.score.maximum,
        source_paper_id=str(event.paper_id),
        assessed_at=event.assessed_at,
        occurred_at=event.occurred_at,
        payload=canonical,
    )
    newer = max(
        (version for version in versions if version.source_version > event.source_version),
        key=lambda version: version.source_version,
        default=None,
    )
    if newer is not None:
        decision.status = "stale"
        decision.superseded_by = newer.event_id
        decision.reason = f"arrived after version {newer.source_version}; never applied"
        session.add(decision)
        batch.report.stale += 1
        return

    # Every other version is older (the same version would have this same id).
    for older in versions:
        if older.status not in LIVE_OLDER_STATUSES:
            continue
        if older.status == "applied":
            _retract(session, older, batch)
        older.status = "superseded"
        older.superseded_by = event_id
        older.reason = f"replaced by version {event.source_version}"
        batch.report.superseded += 1
    session.flush()  # the old version stops being 'applied' before the new one can be

    session.add(decision)
    if event.evidence_class not in TRUSTED_EVIDENCE_CLASSES:
        decision.status = "legacy_unverified"
        decision.reason = f"evidence_class {event.evidence_class!r} is not an official non-generative mark"
        batch.report.legacy_unverified += 1
        return
    topic_ids, problems = resolve_topics(session, registry, event.source_topic_codes)
    if problems:
        decision.status = "quarantined"
        decision.reason = _reason(problems)
        batch.report.quarantined += 1
        return
    _apply(session, decision, topic_ids, batch)
    batch.report.applied += 1


def _apply(session: Session, decision: AssessmentDecision, topic_ids: list[str], batch: _Batch) -> None:
    decision.status = "applied"
    decision.topic_ids = list(topic_ids)
    decision.reason = None
    if session.get(RawEvent, decision.event_id) is None:
        # paper_id stays empty: assessment paper ids are not planner paper ids (the
        # rolling "new full paper" check and paper-year features key on planner papers).
        session.add(
            RawEvent(
                event_id=decision.event_id,
                student_id=decision.subject_user_id,
                source=SOURCE,
                event_type=EVENT_TYPE,
                paper_id=None,
                paper_year=None,
                payload=decision.payload,
                occurred_at=decision.occurred_at,
            )
        )
        session.flush()
    for topic_id in topic_ids:
        session.add(
            TopicEvidence(
                student_id=decision.subject_user_id,
                topic_id=topic_id,
                event_id=decision.event_id,
                question_id=None,
                score=decision.score_awarded,
                max_score=decision.score_maximum,
                difficulty=DEFAULT_DIFFICULTY,
                confidence=None,
                # When the student answered: a later teacher correction must not make old
                # work look recent to the recency weighting.
                observed_at=decision.assessed_at,
            )
        )
    batch.touched[decision.subject_user_id].update(topic_ids)


def _retract(session: Session, decision: AssessmentDecision, batch: _Batch) -> None:
    rows = session.scalars(select(TopicEvidence).where(TopicEvidence.event_id == decision.event_id)).all()
    for row in rows:
        batch.touched[row.student_id].add(row.topic_id)
        session.delete(row)


def _refresh_mastery(session: Session, batch: _Batch) -> None:
    session.flush()
    for student_id, topic_set in batch.touched.items():
        topics = sorted(topic_set)
        before: dict[str, float | None] = {}
        for topic_id in topics:
            state = session.get(LearnerTopicState, (student_id, topic_id))
            before[topic_id] = float(state.mastery) if state is not None else None
        recompute_for(session, student_id, topics, as_of=batch.now)
        session.flush()
        relevant: list[str] = []
        for topic_id in topics:
            state = session.get(LearnerTopicState, (student_id, topic_id))
            has_evidence = (
                session.scalar(
                    select(TopicEvidence.id)
                    .where(TopicEvidence.student_id == student_id, TopicEvidence.topic_id == topic_id)
                    .limit(1)
                )
                is not None
            )
            after: float | None
            if not has_evidence and state is not None:
                # recompute_for leaves a topic without evidence untouched; its old estimate
                # came only from marks that no longer count.
                session.delete(state)
                after = None
            else:
                after = float(state.mastery) if state is not None else None
            if before[topic_id] != after:
                batch.report.mastery_changes += 1
            if _moved(before[topic_id], after):
                relevant.append(topic_id)
        if relevant:
            _flag_predicted_plans(session, student_id, relevant, batch)
    session.flush()
    batch.touched.clear()


def _flag_predicted_plans(session: Session, student_id: str, topic_ids: list[str], batch: _Batch) -> None:
    """Mark the student's assessment-based plans for an early checkpoint (rolling.py) when a
    plan topic's mastery moved. Manual plans keep the student's own priorities."""
    plans = session.scalars(
        select(StudyPlan).where(
            StudyPlan.student_id == student_id,
            StudyPlan.mode == "predicted",
            StudyPlan.exam_date > batch.now.date(),
        )
    ).all()
    for plan in plans:
        plan_topics = {item.get("topic_id") for item in (plan.constraints or {}).get("priorities", [])}
        hit = set(topic_ids) & plan_topics
        if not hit:
            continue
        pending = rolling_state(plan).get(PENDING_KEY) or {}
        set_rolling_state(
            plan,
            **{
                PENDING_KEY: {
                    "since": pending.get("since") or batch.now.isoformat(),
                    "topic_ids": sorted(set(pending.get("topic_ids") or []) | hit),
                }
            },
        )
        batch.report.replans_flagged += 1


def _moved(before: float | None, after: float | None) -> bool:
    if before is None or after is None:
        return before is not after
    return abs(after - before) >= FINALIZED_MARK_REPLAN_EPSILON


def _reject(
    session: Session,
    event_id: Any,
    payload: Mapping[str, Any],
    reason: str,
    batch: _Batch,
) -> None:
    safe_payload = json.loads(json.dumps(payload, default=str))
    fingerprint = hashlib.sha256(
        json.dumps({"source": SOURCE, "reason": reason, "payload": safe_payload}, sort_keys=True).encode()
    ).hexdigest()
    batch.report.rejected += 1
    if fingerprint in batch.fingerprints:
        return
    batch.fingerprints.add(fingerprint)
    exists = session.scalar(
        select(IntegrationRejection.id).where(IntegrationRejection.fingerprint == fingerprint)
    )
    if exists is None:
        session.add(
            IntegrationRejection(
                source=SOURCE,
                event_id=str(event_id)[:120] if event_id is not None else None,
                reason=reason[:300],
                fingerprint=fingerprint,
                payload=safe_payload,
            )
        )


def _summary(exc: ValidationError) -> str:
    parts = []
    for error in exc.errors()[:3]:
        location = ".".join(str(item) for item in error.get("loc", ())) or "event"
        parts.append(f"{location}: {error.get('msg', 'invalid')}")
    return "; ".join(parts)[:250]


def _reason(problems: list[str]) -> str:
    return ("unmapped topic codes - " + "; ".join(problems))[:300]


def _utc(moment: datetime | None) -> datetime:
    current = moment or datetime.now(UTC)
    if current.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    return current.astimezone(UTC)
