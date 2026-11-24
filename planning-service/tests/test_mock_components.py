from pathlib import Path

from tools.mock_components import STUDENT_COUNT, WEEK_COUNT, generate_mock_data


def test_generator_creates_20_students_eight_events_and_separate_truth() -> None:
    topics_path = Path(__file__).resolve().parents[2] / "shared" / "contracts" / "topics.json"

    events, hidden_abilities = generate_mock_data(topics_path)

    assert len(events) == STUDENT_COUNT * WEEK_COUNT
    assert len({event["student_id"] for event in events}) == STUDENT_COUNT
    assert all(len(event["evidence"]) > 0 for event in events)
    assert hidden_abilities
    assert "true_ability" not in events[0]
    assert generate_mock_data(topics_path) == (events, hidden_abilities)
