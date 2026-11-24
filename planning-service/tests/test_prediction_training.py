import csv
import json
from datetime import UTC, datetime, timedelta

import pytest

from app.ai.prediction.features import build_training_samples
from app.ai.prediction.model import predict, train_models
from app.ai.prediction.registry import load_latest, save_version
from app.ai.prediction.train import load_training_rows


def _synthetic_evidence() -> list[dict]:
    start = datetime(2026, 1, 1, tzinfo=UTC)
    rows = []
    for student_number in range(24):
        for week in range(12):
            score = 3 + ((student_number + week) % 7)
            rows.append(
                {
                    "student_id": f"student-{student_number}",
                    "topic_id": "chem-moles",
                    "score": score,
                    "max_score": 10,
                    "difficulty": 0.3 + (week % 5) / 10,
                    "observed_at": start + timedelta(days=7 * week),
                }
            )
    return rows


def test_time_aware_training_reports_baselines_and_classifier_metrics(tmp_path) -> None:
    pytest.importorskip("xgboost")
    samples = build_training_samples(_synthetic_evidence())

    regressor, classifier, report = train_models(samples, version="test-xgb", seed=10)
    destination = save_version(
        tmp_path,
        version="test-xgb",
        regressor=regressor,
        classifier=classifier,
        report=report,
    )
    loaded_regressor, loaded_classifier, metadata = load_latest(tmp_path)
    prediction, weak_probability, factors = predict(
        loaded_regressor,
        loaded_classifier,
        samples[-1].features,
    )

    assert destination.is_dir()
    assert metadata["version"] == "test-xgb"
    assert report.train_samples + report.validation_samples + report.test_samples == len(samples)
    assert report.split_dates["train_end"] < report.split_dates["test_start"]
    assert {"xgboost", "global_mean_baseline", "last_score_baseline"} == set(report.regression)
    assert {"mae", "rmse"} == set(report.regression["xgboost"])
    assert {"f1", "auc"} == set(report.weak_topic)
    assert loaded_regressor is not None
    assert loaded_classifier is not None
    assert 0 <= prediction <= 1
    assert 0 <= weak_probability <= 1
    assert factors


def test_trainer_reads_generated_synthetic_event_jsonl(tmp_path) -> None:
    events = []
    for student_number in range(3):
        for week in range(3):
            events.append(
                {
                    "student_id": f"synthetic-{student_number}",
                    "occurred_at": (datetime(2026, 1, 1, tzinfo=UTC) + timedelta(days=week * 7)).isoformat(),
                    "evidence": [
                        {
                            "topic_id": "chem-mole",
                            "score": student_number + week + 1,
                            "max_score": 5,
                            "difficulty": 0.5,
                        }
                    ],
                }
            )
    (tmp_path / "events.jsonl").write_text(
        "".join(json.dumps(event) + "\n" for event in events),
        encoding="utf-8",
    )
    (tmp_path / "hidden_abilities.jsonl").write_text(
        json.dumps({"student_id": "synthetic-0", "topic_id": "chem-mole", "true_ability": 0.9}) + "\n",
        encoding="utf-8",
    )

    evidence, tasks = load_training_rows(tmp_path)
    samples = build_training_samples(evidence, tasks)

    assert len(evidence) == 9
    assert len(samples) == 6


def test_missing_training_directory_explains_how_to_create_data(tmp_path) -> None:
    from app.ai.prediction.train import load_training_rows

    with pytest.raises(ValueError, match="tools.mock_components"):
        load_training_rows(tmp_path / "missing")


def test_trainer_reads_oulad_assessment_csvs(tmp_path) -> None:
    (tmp_path / "assessments.csv").write_text(
        "id_assessment,code_module,code_presentation,assessment_type,date,weight\n"
        "10,AAA,2013J,TMA,10,100\n"
        "11,AAA,2013J,TMA,20,100\n",
        encoding="utf-8",
    )
    with (tmp_path / "studentAssessment.csv").open("w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(output, fieldnames=["id_assessment", "id_student", "date_submitted", "score"])
        writer.writeheader()
        writer.writerows(
            [
                {"id_assessment": 10, "id_student": 1, "date_submitted": 9, "score": 75},
                {"id_assessment": 11, "id_student": 1, "date_submitted": 19, "score": 80},
            ]
        )

    evidence, _ = load_training_rows(tmp_path)

    assert len(evidence) == 2
    assert evidence[0]["topic_id"] == "oulad:AAA:2013J"
    assert evidence[0]["score"] == 75
    assert evidence[0]["max_score"] == 100


def test_training_requires_three_distinct_time_periods() -> None:
    start = datetime(2026, 1, 1, tzinfo=UTC)
    rows = [
        {
            "student_id": f"student-{student_number}",
            "topic_id": "chem-mole",
            "score": 2 + (student_number + week) % 7,
            "max_score": 10,
            "observed_at": start + timedelta(days=week * 7),
        }
        for student_number in range(24)
        for week in range(3)
    ]
    samples = build_training_samples(rows)

    with pytest.raises(ValueError, match="three distinct"):
        train_models(samples, version="invalid")
