import csv
import json
from pathlib import Path
from uuid import UUID

from app.ai.prediction.train import load_training_rows
from app.schemas.synthetic_events import (
    Component1CompletionEvent,
    Component2AssessmentEvent,
)
from scripts.evaluate import read_teacher_ranking
from scripts.generate_datasets import (
    DEFAULT_CONFIG,
    DEFAULT_TOPICS_PATH,
    generate_datasets,
    write_datasets,
)
from scripts.seed_topics import load_topics


def _small_config(tmp_path: Path, *, synthetic_count: int = 7) -> Path:
    config = json.loads(DEFAULT_CONFIG.read_text(encoding="utf-8"))
    config["synthetic_count"] = synthetic_count
    config_path = tmp_path / "demo_students.json"
    config_path.write_text(json.dumps(config), encoding="utf-8")
    return config_path


def test_generation_is_deterministic_and_seed_controls_synthetic_uuids(tmp_path: Path) -> None:
    config_path = _small_config(tmp_path)

    first = generate_datasets(config_path, DEFAULT_TOPICS_PATH, seed=91)
    second = generate_datasets(config_path, DEFAULT_TOPICS_PATH, seed=91)
    changed_seed = generate_datasets(config_path, DEFAULT_TOPICS_PATH, seed=92)

    assert first == second
    first_students = {event["student_id"] for event in first["assessment_events.jsonl"]}
    other_students = {event["student_id"] for event in changed_seed["assessment_events.jsonl"]}
    assert first_students != other_students
    assert len(first["assessment_events.jsonl"]) == 10 * 8
    catalogue = load_topics(DEFAULT_TOPICS_PATH)
    parent_ids = {topic["parent_id"] for topic in catalogue if topic["parent_id"] is not None}
    leaf_count = len(catalogue) - len(parent_ids)
    assert len(first["teacher_ranking.csv"]) == 10 * leaf_count
    synthetic_students = {
        row["student"] for row in first["teacher_ranking.csv"] if row["student"].startswith("S")
    }
    assert synthetic_students == {f"S{number:03d}" for number in range(1, 8)}
    assert all(UUID(row["student_id"]) for row in first["teacher_ranking.csv"])


def test_generated_events_validate_against_component_schemas(tmp_path: Path) -> None:
    config_path = _small_config(tmp_path, synthetic_count=2)
    outputs = generate_datasets(config_path, DEFAULT_TOPICS_PATH, seed=123)
    allowed_topics = {topic["id"] for topic in load_topics(DEFAULT_TOPICS_PATH)}

    assessment_events = outputs["assessment_events.jsonl"]
    completion_events = outputs["completion_events.jsonl"]
    for event in assessment_events:
        validated = Component2AssessmentEvent.model_validate(event)
        UUID(validated.event_id)
        assert {result.topic_id for result in validated.results} <= allowed_topics
    for event in completion_events:
        validated = Component1CompletionEvent.model_validate(event)
        assert validated.topic_id in allowed_topics

    for filename in ("low_mark_event.json", "high_mark_event.json"):
        event = Component2AssessmentEvent.model_validate(outputs[filename])
        assert event.student_id == "614f0cf0-bd67-461d-9958-0bd24adbce04"
        assert event.results[0].topic_id in allowed_topics
    low = outputs["low_mark_event.json"]["results"][0]["marks_awarded"]
    high = outputs["high_mark_event.json"]["results"][0]["marks_awarded"]
    assert low < high


def test_generated_csvs_support_evaluation_and_training(tmp_path: Path) -> None:
    config_path = _small_config(tmp_path, synthetic_count=7)
    outputs = generate_datasets(config_path, DEFAULT_TOPICS_PATH, seed=364)
    output_dir = tmp_path / "generated"
    counts = write_datasets(outputs, output_dir)

    rankings = read_teacher_ranking(output_dir / "teacher_ranking.csv")
    evidence, tasks = load_training_rows(output_dir)
    with (output_dir / "training_scores.csv").open(encoding="utf-8", newline="") as source:
        training_rows = list(csv.DictReader(source))

    catalogue = load_topics(DEFAULT_TOPICS_PATH)
    parent_ids = {topic["parent_id"] for topic in catalogue if topic["parent_id"] is not None}
    leaf_count = len(catalogue) - len(parent_ids)
    assert len(rankings) == leaf_count
    assert len(evidence) == len(training_rows)
    assert not tasks
    assert counts["assessment_events.jsonl"] == 80
    assert counts["low_mark_event.json"] == 1
