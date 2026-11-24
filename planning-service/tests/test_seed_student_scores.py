from datetime import UTC, datetime

import pytest

from app.schemas.events import AssessmentEvent
from scripts.seed_student_scores import GRADE_TARGETS, build_events

TOPICS = [f"chem-u{unit}-topic-{index}" for unit in range(1, 15) for index in range(4)]
NOW = datetime(2026, 10, 21, tzinfo=UTC)


@pytest.mark.parametrize("grade", sorted(GRADE_TARGETS))
def test_seeded_scores_centre_on_the_grade_band_and_are_valid_events(grade: str) -> None:
    events = build_events(
        "student-1", grade, TOPICS, papers=8, weeks=10, topics_per_paper=20, seed=1, now=NOW
    )

    scores = [item["score"] / item["max_score"] for event in events for item in event["evidence"]]
    assert len(events) == 8
    assert abs(sum(scores) / len(scores) - GRADE_TARGETS[grade]) < 0.06
    assert all(AssessmentEvent.model_validate(event) for event in events)
    assert all(datetime.fromisoformat(event["occurred_at"]) < NOW for event in events)


def test_seeding_is_deterministic_so_reruns_are_skipped_as_duplicates() -> None:
    first = build_events("student-1", "S", TOPICS, papers=8, weeks=10, topics_per_paper=20, seed=1, now=NOW)
    second = build_events("student-1", "S", TOPICS, papers=8, weeks=10, topics_per_paper=20, seed=1, now=NOW)

    assert [event["event_id"] for event in first] == [event["event_id"] for event in second]
    assert first == second


@pytest.mark.parametrize("grade", ["S", "B"])
def test_calibration_targets_the_mastery_students_see(grade: str) -> None:
    from scripts.seed_student_scores import average_mastery, calibrated_events

    events = calibrated_events(
        "student-1", grade, TOPICS, papers=8, weeks=10, topics_per_paper=20, seed=1, now=NOW
    )

    assert abs(average_mastery(events, NOW) - GRADE_TARGETS[grade]) < 0.03
