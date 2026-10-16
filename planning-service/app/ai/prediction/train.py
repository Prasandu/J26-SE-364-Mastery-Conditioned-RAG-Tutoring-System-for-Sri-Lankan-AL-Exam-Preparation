"""Train and evaluate versioned topic prediction models from local datasets."""

from __future__ import annotations

import argparse
import csv
import json
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.ai.prediction.features import TrainingSample, build_training_samples
from app.ai.prediction.model import train_models
from app.ai.prediction.registry import save_version

LOGGER = logging.getLogger(__name__)


def load_training_rows(data_dir: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Read canonical CSV/JSONL evidence, generated mock events, and OULAD assessments."""
    if not data_dir.exists():
        raise ValueError(
            f"data directory does not exist: {data_dir}. Generate synthetic data with "
            "'python -m tools.mock_components --output-dir data/mock' or add OULAD/topic CSV files."
        )
    if not data_dir.is_dir():
        raise ValueError(f"data path is not a directory: {data_dir}")
    evidence: list[dict[str, Any]] = []
    tasks: list[dict[str, Any]] = []
    has_generated_training_csv = any(path.name == "training_scores.csv" for path in data_dir.rglob("*.csv"))
    for path in sorted(data_dir.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() == ".csv":
            rows = _read_csv(path)
            headers = set(rows[0]) if rows else _headers(path)
            if path.name.lower() == "studentassessment.csv":
                evidence.extend(_oulad_rows(path, rows, data_dir))
            elif {"student_id", "topic_id", "score", "max_score", "observed_at"} <= headers:
                evidence.extend(rows)
            elif {"student_id", "topic_id", "normalized_score", "observed_at"} <= headers:
                evidence.extend(rows)
            elif {"student_id", "topic_id", "start_at", "duration_min", "status"} <= headers:
                tasks.extend(rows)
        elif (
            path.suffix.lower() == ".jsonl"
            and path.name not in {"hidden_abilities.jsonl", "completion_events.jsonl"}
            and not (path.name == "assessment_events.jsonl" and has_generated_training_csv)
        ):
            evidence.extend(_mock_event_rows(path))
    if not evidence:
        raise ValueError(
            f"no supported evidence found under {data_dir}; provide OULAD CSVs, "
            "topic evidence CSV, or mock assessment JSONL"
        )
    return evidence, tasks


def create_samples(
    evidence: list[dict[str, Any]],
    tasks: list[dict[str, Any]],
) -> list[TrainingSample]:
    """Keep train and inference features aligned to avoid deployment skew."""
    return build_training_samples(evidence, tasks)


def train_from_directory(data_dir: Path, model_dir: Path, *, seed: int = 364) -> dict[str, Any]:
    """Train, evaluate, and atomically publish a local model version."""
    evidence, tasks = load_training_rows(data_dir)
    samples = create_samples(evidence, tasks)
    version = datetime.now(UTC).strftime("xgb-%Y%m%dT%H%M%SZ") + f"-{uuid4().hex[:8]}"
    regressor, classifier, report = train_models(samples, version=version, seed=seed)
    destination = save_version(
        model_dir,
        version=version,
        regressor=regressor,
        classifier=classifier,
        report=report,
    )
    LOGGER.info("Trained XGBoost models from %d samples; saved to %s", len(samples), destination)
    return {
        "version": version,
        "model_dir": str(destination),
        "regression": report.regression,
        "weak_topic": report.weak_topic,
        "samples": report.samples,
        "train_samples": report.train_samples,
        "validation_samples": report.validation_samples,
        "test_samples": report.test_samples,
        "split_dates": report.split_dates,
    }


def _read_csv(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def _headers(path: Path) -> set[str]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        return set(next(csv.reader(source), []))


def _mock_event_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as source:
        for line_number, line in enumerate(source, start=1):
            if not line.strip():
                continue
            event = json.loads(line)
            occurred_at = event.get("occurred_at")
            student_id = event.get("student_id")
            submitted_at = event.get("submitted_at")
            results = event.get("results")
            if submitted_at and student_id and isinstance(results, list):
                rows.extend(
                    {
                        "student_id": student_id,
                        "topic_id": item["topic_id"],
                        "score": item["marks_awarded"],
                        "max_score": item["marks_total"],
                        "difficulty": item["difficulty"],
                        "observed_at": submitted_at,
                    }
                    for item in results
                )
                continue
            if not occurred_at or not student_id:
                raise ValueError(f"{path}:{line_number} is missing student_id or occurred_at")
            for item in event.get("evidence", []):
                rows.append(
                    {
                        **item,
                        "student_id": student_id,
                        "observed_at": occurred_at,
                    }
                )
    return rows


def _oulad_rows(
    student_assessment_path: Path,
    student_rows: list[dict[str, Any]],
    data_dir: Path,
) -> list[dict[str, Any]]:
    assessment_path = next(
        (path for path in data_dir.rglob("assessments.csv") if path.parent == student_assessment_path.parent),
        None,
    )
    if assessment_path is None:
        raise ValueError(f"{student_assessment_path} requires adjacent OULAD assessments.csv")
    assessments = {
        row["id_assessment"]: row
        for row in _read_csv(assessment_path)
        if row.get("id_assessment") and row.get("date") not in ("", None)
    }
    result: list[dict[str, Any]] = []
    for row in student_rows:
        assessment = assessments.get(row.get("id_assessment"))
        if assessment is None or row.get("score") in ("", None):
            continue
        raw = float(row["score"])
        if not 0 <= raw <= 100:
            continue
        date_value = row.get("date_submitted")
        day = int(date_value) if date_value not in ("", None, "-1") else int(assessment["date"])
        result.append(
            {
                "student_id": f"oulad-{row['id_student']}",
                "topic_id": f"oulad:{assessment['code_module']}:{assessment['code_presentation']}",
                "score": raw,
                "max_score": 100,
                "difficulty": 0.5,
                "observed_at": _oulad_date(day),
            }
        )
    return result


def _oulad_date(day: int) -> datetime:
    return datetime(2013, 1, 1, tzinfo=UTC) + timedelta(days=day)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--model-dir", type=Path, default=Path("models"))
    parser.add_argument("--seed", type=int, default=364)
    arguments = parser.parse_args()
    try:
        report = train_from_directory(arguments.data_dir, arguments.model_dir, seed=arguments.seed)
    except ValueError as exc:
        parser.error(str(exc))
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
