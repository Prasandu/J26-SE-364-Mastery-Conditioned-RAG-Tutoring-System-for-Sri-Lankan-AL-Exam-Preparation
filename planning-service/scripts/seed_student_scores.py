"""Seed demo assessment results for one student at a chosen grade level.

Creates past "papers" (assessment events) through the normal ingest path, so
topic evidence, mastery, trends and decline alerts are computed exactly as for
real results. Event IDs are deterministic, so re-running is safe (duplicates
are skipped).

    python -m scripts.seed_student_scores --student <uuid> --grade S --dry-run
    python -m scripts.seed_student_scores --student <uuid> --grade S
"""

from __future__ import annotations

import argparse
import random
import sys
from datetime import UTC, datetime, timedelta

# Target average *mastery* per grade band (midpoints of the planner's A/L bands).
# Raw paper scores are calibrated so the mastery the student sees lands here;
# mastery also credits consistency and coverage, so raw scores sit lower.
GRADE_TARGETS = {"A": 0.82, "B": 0.70, "C": 0.57, "S": 0.42, "F": 0.25}
TOPIC_SPREAD = 0.10  # how far individual topics sit from the student's average
ATTEMPT_NOISE = 0.08  # paper-to-paper variation on the same topic
DECLINING_TOPICS = 2  # topics that dip in the latest papers (to show decline alerts)


def build_events(
    student_id: str,
    grade: str,
    leaf_topic_ids: list[str],
    *,
    papers: int,
    weeks: int,
    topics_per_paper: int,
    seed: int,
    now: datetime,
    raw_target: float | None = None,
) -> list[dict]:
    """Return assessment event payloads (plain dicts) for the student."""
    rng = random.Random(f"{seed}:{student_id}:{grade}")
    target = GRADE_TARGETS[grade] if raw_target is None else raw_target
    ability = {topic_id: min(0.95, max(0.05, rng.gauss(target, TOPIC_SPREAD))) for topic_id in leaf_topic_ids}
    declining = set(rng.sample(leaf_topic_ids, min(DECLINING_TOPICS, len(leaf_topic_ids))))
    events = []
    for index in range(papers):
        occurred_at = now - timedelta(days=round(weeks * 7 * (papers - index) / papers))
        recent = index >= papers - 3
        chosen = rng.sample(leaf_topic_ids, min(topics_per_paper, len(leaf_topic_ids)))
        # Make sure declining topics appear in the recent papers so the dip is visible.
        if recent:
            chosen = list(dict.fromkeys([*declining, *chosen]))[:topics_per_paper]
        evidence = []
        for topic_id in chosen:
            level = ability[topic_id]
            if topic_id in declining:
                level = level + 0.15 if not recent else level - 0.15
            fraction = min(1.0, max(0.0, rng.gauss(level, ATTEMPT_NOISE)))
            evidence.append(
                {
                    "topic_id": topic_id,
                    "score": round(fraction * 10 * 2) / 2,  # out of 10, half marks
                    "max_score": 10,
                    "difficulty": round(rng.uniform(0.4, 0.7), 2),
                }
            )
        events.append(
            {
                "event_id": f"seed-{student_id}-{grade}-paper-{index + 1:02d}",
                "student_id": student_id,
                "paper_id": f"seed-{grade}-paper-{index + 1:02d}",
                "occurred_at": occurred_at.isoformat(),
                "evidence": evidence,
            }
        )
    return events


def average_mastery(events: list[dict], now: datetime) -> float:
    """Average mastery across topics, computed with the planner's own formula."""
    from app.services.mastery import EvidenceObservation, compute_mastery

    by_topic: dict[str, list[EvidenceObservation]] = {}
    for event in events:
        observed_at = datetime.fromisoformat(event["occurred_at"])
        for item in event["evidence"]:
            by_topic.setdefault(item["topic_id"], []).append(
                EvidenceObservation(
                    score=item["score"],
                    max_score=item["max_score"],
                    difficulty=item["difficulty"],
                    observed_at=observed_at,
                )
            )
    values = [compute_mastery(observations, as_of=now) for observations in by_topic.values()]
    return sum(values) / len(values) if values else 0.0


def calibrated_events(student_id: str, grade: str, leaf_topic_ids: list[str], **options) -> list[dict]:
    """Search the raw score level so the resulting average mastery hits the grade target."""
    target = GRADE_TARGETS[grade]
    low, high = 0.0, 1.0
    best = build_events(student_id, grade, leaf_topic_ids, raw_target=target, **options)
    for _ in range(14):
        middle = (low + high) / 2
        events = build_events(student_id, grade, leaf_topic_ids, raw_target=middle, **options)
        mastery = average_mastery(events, options["now"])
        best = events
        if abs(mastery - target) < 0.005:
            break
        if mastery < target:
            low = middle
        else:
            high = middle
    return best


def reset_seeded(session, student_id: str) -> int:
    """Delete only this script's seeded papers for the student and refresh mastery."""
    from sqlalchemy import select

    from app.models import LearnerTopicState, RawEvent, TopicEvidence
    from app.services.mastery import recompute_for

    seeded = session.scalars(select(RawEvent).where(RawEvent.event_id.like(f"seed-{student_id}-%"))).all()
    seeded_ids = [event.event_id for event in seeded]
    topic_ids = set(
        session.scalars(select(TopicEvidence.topic_id).where(TopicEvidence.event_id.in_(seeded_ids))).all()
    )
    for event in seeded:
        session.delete(event)  # topic evidence is removed by ON DELETE CASCADE
    session.flush()
    remaining = set(
        session.scalars(
            select(TopicEvidence.topic_id).where(
                TopicEvidence.student_id == student_id,
                TopicEvidence.topic_id.in_(topic_ids),
            )
        ).all()
    )
    for state in session.scalars(
        select(LearnerTopicState).where(
            LearnerTopicState.student_id == student_id,
            LearnerTopicState.topic_id.in_(topic_ids - remaining),
        )
    ).all():
        session.delete(state)
    recompute_for(session, student_id, sorted(remaining))
    session.commit()
    return len(seeded)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--student", required=True, help="Student ID (Supabase user UUID).")
    parser.add_argument("--grade", default="S", choices=sorted(GRADE_TARGETS), help="Target grade level.")
    parser.add_argument("--papers", type=int, default=8, help="Number of past papers to create.")
    parser.add_argument("--weeks", type=int, default=10, help="Spread the papers over this many past weeks.")
    parser.add_argument("--topics-per-paper", type=int, default=20)
    parser.add_argument("--seed", type=int, default=364)
    parser.add_argument("--dry-run", action="store_true", help="Show what would be created without saving.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="First delete papers previously seeded by this script for the student.",
    )
    arguments = parser.parse_args()

    from app.db import SessionLocal
    from app.schemas.events import AssessmentEvent
    from app.services.event_ingestion import ingest_assessment_event
    from app.services.topic_lookup import preload_topics

    session = SessionLocal()
    try:
        topics = preload_topics(session)
        parents = {getattr(topic, "parent_id", None) for topic in topics.values()}
        leaves = sorted(topic_id for topic_id in topics if topic_id not in parents)
        if not leaves:
            print("No topics found. Run `python -m scripts.seed_topics` first.", file=sys.stderr)
            return 2
        now = datetime.now(UTC)
        events = calibrated_events(
            arguments.student,
            arguments.grade,
            leaves,
            papers=arguments.papers,
            weeks=arguments.weeks,
            topics_per_paper=arguments.topics_per_paper,
            seed=arguments.seed,
            now=now,
        )
        scores = [item["score"] / item["max_score"] for event in events for item in event["evidence"]]
        print(
            f"{len(events)} papers, {len(scores)} topic scores for {arguments.student} "
            f"(grade {arguments.grade}: raw scores average {sum(scores) / len(scores):.0%}, "
            f"expected mastery {average_mastery(events, now):.0%})."
        )
        if arguments.dry_run:
            print("Dry run: nothing saved.")
            return 0
        if arguments.reset:
            print(f"Removed {reset_seeded(session, arguments.student)} previously seeded papers.")
        accepted = duplicate = 0
        for payload in events:
            result = ingest_assessment_event(session, AssessmentEvent.model_validate(payload), source="seed")
            if result.get("duplicate"):
                duplicate += 1
            else:
                accepted += 1
        print(f"Saved {accepted} papers ({duplicate} already existed).")
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
