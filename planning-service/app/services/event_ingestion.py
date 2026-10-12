from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import Conflict, ConstraintViolation
from app.models import RawEvent, Topic, TopicEvidence
from app.schemas.events import AssessmentEvent, EvidenceItem, ModuleCompletionEvent
from app.services.mastery import recompute_for


def ingest_assessment_event(
    session: Session,
    event: AssessmentEvent,
    *,
    source: str = "push",
) -> dict[str, Any]:
    payload = event.model_dump(mode="json")
    return _ingest(
        session=session,
        event_id=event.event_id,
        student_id=event.student_id,
        event_type="assessment",
        occurred_at=event.occurred_at,
        evidence=event.evidence,
        payload=payload,
        source=source,
    )


def ingest_module_completion(
    session: Session,
    event: ModuleCompletionEvent,
) -> dict[str, Any]:
    payload = event.model_dump(mode="json")
    evidence = [
        EvidenceItem(
            topic_id=event.topic_id,
            score=event.score,
            max_score=event.max_score,
            difficulty=event.difficulty,
            confidence=event.confidence,
        )
    ]
    return _ingest(
        session=session,
        event_id=event.event_id,
        student_id=event.student_id,
        event_type="module_completion",
        occurred_at=event.completed_at,
        evidence=evidence,
        payload=payload,
        source="push",
    )


def _ingest(
    *,
    session: Session,
    event_id: str,
    student_id: str,
    event_type: str,
    occurred_at: datetime,
    evidence: Sequence[EvidenceItem],
    payload: dict[str, Any],
    source: str,
) -> dict[str, Any]:
    event_data = {
        "event_id": event_id,
        "student_id": student_id,
        "source": source,
        "event_type": event_type,
        "payload": payload,
        "occurred_at": occurred_at,
    }
    existing = session.get(RawEvent, event_id)
    if existing is not None:
        return _duplicate_or_conflict(existing, event_data, len(evidence))

    topic_ids = list(dict.fromkeys(item.topic_id for item in evidence))
    unknown_topics = [topic_id for topic_id in topic_ids if session.get(Topic, topic_id) is None]
    if unknown_topics:
        raise ConstraintViolation(f"Unknown topic_ids: {', '.join(unknown_topics)}")

    raw_event = RawEvent(**event_data)
    session.add(raw_event)
    try:
        session.flush()
        for item in evidence:
            session.add(
                TopicEvidence(
                    student_id=student_id,
                    topic_id=item.topic_id,
                    event_id=event_id,
                    score=item.score,
                    max_score=item.max_score,
                    difficulty=item.difficulty,
                    confidence=item.confidence,
                    observed_at=occurred_at,
                )
            )
        session.flush()
        recompute_for(session, student_id, topic_ids)
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        existing = session.get(RawEvent, event_id)
        if existing is not None:
            return _duplicate_or_conflict(existing, event_data, len(evidence))
        raise Conflict("Event could not be stored because it conflicts with existing data.") from exc

    return {
        "event_id": event_id,
        "accepted": True,
        "duplicate": False,
        "evidence_count": len(evidence),
    }


def _duplicate_or_conflict(
    existing: RawEvent,
    incoming: dict[str, Any],
    evidence_count: int,
) -> dict[str, Any]:
    if (
        existing.student_id != incoming["student_id"]
        or existing.source != incoming["source"]
        or existing.event_type != incoming["event_type"]
        or existing.payload != incoming["payload"]
    ):
        raise Conflict(f"event_id {incoming['event_id']!r} was already used for a different event.")
    return {
        "event_id": incoming["event_id"],
        "accepted": True,
        "duplicate": True,
        "evidence_count": evidence_count,
    }
