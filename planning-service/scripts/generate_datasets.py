"""Generate deterministic synthetic demo and training datasets."""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5
from zoneinfo import ZoneInfo

from app.schemas.synthetic_events import (
    Component1CompletionEvent,
    Component2AssessmentEvent,
)
from scripts.seed_topics import DEFAULT_TOPICS_PATH, load_topics

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG = SCRIPT_DIR / "demo_students.json"
DEFAULT_OUTPUT_DIR = SCRIPT_DIR.parent / "data" / "generated"
DEFAULT_TIMEZONE = ZoneInfo("Asia/Colombo")
EVENT_NAMESPACE = UUID("56f4ac44-1ed4-5dd2-9a7a-2b4f3b7a1f66")
CHEMICAL_CALCULATION_TOPICS = (
    "chem-u3-molar-mass",
    "chem-u3-equation-ratios",
    "chem-u13-cell-reactions",
)
TRAINING_FIELDS = (
    "student_id",
    "student",
    "topic_id",
    "week",
    "score",
    "max_score",
    "observed_at",
    "difficulty",
    "features",
)
TEACHER_FIELDS = ("student_id", "student", "topic_id", "rank", "exam_weight")


def generate_datasets(
    config_path: Path = DEFAULT_CONFIG,
    topics_path: Path = DEFAULT_TOPICS_PATH,
    *,
    seed: int | None = None,
) -> dict[str, list[dict[str, Any]] | dict[str, Any]]:
    config = _read_config(config_path)
    actual_seed = config["seed"] if seed is None else seed
    rng = random.Random(actual_seed)
    catalogue_topics = load_topics(topics_path)
    parent_ids = {topic["parent_id"] for topic in catalogue_topics if topic["parent_id"] is not None}
    parent_topic_ids = {topic["id"] for topic in catalogue_topics if topic["id"] in parent_ids}
    topics = [topic for topic in catalogue_topics if topic["id"] not in parent_topic_ids]
    topic_by_id = {topic["id"]: topic for topic in topics}
    if not topics:
        raise ValueError("Shared topic catalogue does not contain any assessable topics.")
    topic_ids = set(topic_by_id)
    for required_id in CHEMICAL_CALCULATION_TOPICS:
        if required_id not in topic_by_id:
            raise ValueError(f"Required profile topic {required_id!r} is missing from the shared catalogue.")
    for persona in config["personas"]:
        for profile_field in ("stale_topics", "declining_topics", "error_topics"):
            unknown_ids = set(persona["profile"].get(profile_field, [])) - topic_ids
            if unknown_ids:
                raise ValueError(
                    f"Persona {persona['name']!r} profile references unknown topic IDs: "
                    f"{', '.join(sorted(unknown_ids))}"
                )

    reference_date = date.fromisoformat(config["reference_date"])
    students = _build_students(config, actual_seed, rng)
    histories: dict[str, dict[str, list[dict[str, Any]]]] = {}
    assessment_events: list[dict[str, Any]] = []
    completion_events: list[dict[str, Any]] = []

    for student in students:
        student_histories: dict[str, list[dict[str, Any]]] = {topic["id"]: [] for topic in topics}
        for week in range(8):
            submitted_at = datetime.combine(
                reference_date - timedelta(weeks=7 - week, days=student["day_offset"]),
                time(hour=16 + (student["day_offset"] % 3), minute=15),
                tzinfo=DEFAULT_TIMEZONE,
            )
            iso_calendar = submitted_at.date().isocalendar()
            paper_id = f"PP-{iso_calendar.year}-W{iso_calendar.week:02d}"
            difficulty = rng.uniform(0.25, 0.8)
            results: list[dict[str, Any]] = []
            for topic in topics:
                topic_id = topic["id"]
                if _is_stale_omission(student["profile"], topic_id, week):
                    continue
                result = _assessment_result(
                    student,
                    topic,
                    week,
                    difficulty,
                    rng,
                    submitted_at,
                )
                results.append(result)
                student_histories[topic_id].append(
                    {
                        "student_id": student["student_id"],
                        "topic_id": topic_id,
                        "week": week + 1,
                        "score": result["marks_awarded"] / result["marks_total"],
                        "observed_at": submitted_at.isoformat(),
                        "difficulty": result["difficulty"],
                        "error_type": result["error_type"],
                        "time_spent_sec": result["time_spent_sec"],
                    }
                )
            if results:
                assessment_events.append(
                    Component2AssessmentEvent(
                        event_id=str(
                            uuid5(EVENT_NAMESPACE, f"assessment:{student['student_id']}:{week + 1}")
                        ),
                        student_id=student["student_id"],
                        paper_id=paper_id,
                        source="past_paper",
                        submitted_at=submitted_at,
                        results=results,
                    ).model_dump(mode="json")
                )

        histories[student["student_id"]] = student_histories
        completion_events.extend(_completion_events(student, student_histories, reference_date, rng))

    ranking_students = students[: min(len(students), 10)]
    teacher_rankings = _teacher_rankings(ranking_students, topics, histories)
    training_scores = _training_rows(topics, histories, students)
    pasindu = next(student for student in students if student["name"] == "pasindu")
    low_mark_event, high_mark_event = _demo_mark_events(pasindu, reference_date)

    return {
        "assessment_events.jsonl": assessment_events,
        "completion_events.jsonl": completion_events,
        "teacher_ranking.csv": teacher_rankings,
        "training_scores.csv": training_scores,
        "low_mark_event.json": low_mark_event,
        "high_mark_event.json": high_mark_event,
    }


def write_datasets(
    outputs: dict[str, list[dict[str, Any]] | dict[str, Any]],
    output_dir: Path = DEFAULT_OUTPUT_DIR,
) -> dict[str, int]:
    output_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    for filename, rows in outputs.items():
        path = output_dir / filename
        if filename.endswith(".jsonl"):
            json_rows = _as_rows(rows)
            with path.open("w", encoding="utf-8", newline="\n") as output:
                for row in json_rows:
                    output.write(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n")
            counts[filename] = len(json_rows)
        elif filename.endswith(".csv"):
            csv_rows = _as_rows(rows)
            fields = TEACHER_FIELDS if filename == "teacher_ranking.csv" else TRAINING_FIELDS
            with path.open("w", encoding="utf-8", newline="") as output:
                writer = csv.DictWriter(output, fieldnames=fields, lineterminator="\n")
                writer.writeheader()
                writer.writerows(csv_rows)
            counts[filename] = len(csv_rows)
        else:
            with path.open("w", encoding="utf-8", newline="\n") as output:
                json.dump(rows, output, indent=2, sort_keys=True)
                output.write("\n")
            counts[filename] = 1
    return counts


def count_datasets(outputs: dict[str, list[dict[str, Any]] | dict[str, Any]]) -> dict[str, int]:
    return {
        filename: len(rows) if filename.endswith((".jsonl", ".csv")) else 1
        for filename, rows in outputs.items()
    }


def _read_config(path: Path) -> dict[str, Any]:
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ValueError(f"Cannot read demo student config {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Demo student config is not valid JSON: {path}") from exc

    if not isinstance(config, dict):
        raise ValueError("Demo student config must be an object.")
    if not isinstance(config.get("synthetic_count"), int) or config["synthetic_count"] < 0:
        raise ValueError("synthetic_count must be a non-negative integer.")
    if not isinstance(config.get("seed"), int):
        raise ValueError("seed must be an integer.")
    try:
        date.fromisoformat(config["reference_date"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("reference_date must be an ISO date.") from exc
    personas = config.get("personas")
    if not isinstance(personas, list) or not personas:
        raise ValueError("personas must be a non-empty array.")
    used_student_ids: set[str] = set()
    for index, persona in enumerate(personas):
        if not isinstance(persona, dict) or not all(
            isinstance(persona.get(field), str) and persona[field].strip()
            for field in ("name", "email", "student_id")
        ):
            raise ValueError(f"persona at index {index} requires name, email, and student_id.")
        if persona["student_id"] in used_student_ids:
            raise ValueError(f"Duplicate persona student_id: {persona['student_id']}")
        if not isinstance(persona.get("profile"), dict):
            raise ValueError(f"persona {persona['name']!r} requires a profile object.")
        used_student_ids.add(persona["student_id"])
    return config


def _build_students(
    config: dict[str, Any],
    seed: int,
    rng: random.Random,
) -> list[dict[str, Any]]:
    students = [
        {
            "name": persona["name"],
            "email": persona["email"],
            "student_id": persona["student_id"],
            "profile": persona["profile"],
            "day_offset": index % 6,
            "abilities": {},
        }
        for index, persona in enumerate(config["personas"])
    ]
    namespace = uuid5(NAMESPACE_URL, f"mastery-conditioned-rag:synthetic-students:{seed}")
    for index in range(1, config["synthetic_count"] + 1):
        synthetic_id = f"S{index:03d}"
        profile = {
            "kind": "synthetic",
            "ability": rng.uniform(0.32, 0.82),
            "topic_spread": rng.uniform(0.1, 0.23),
            "noise": rng.uniform(0.07, 0.15),
            "trend": rng.uniform(-0.025, 0.025),
        }
        students.append(
            {
                "name": synthetic_id,
                "email": None,
                "synthetic_id": synthetic_id,
                "student_id": str(uuid5(namespace, synthetic_id)),
                "profile": profile,
                "day_offset": rng.randrange(7),
                "abilities": {},
            }
        )
    return students


def _is_stale_omission(profile: dict[str, Any], topic_id: str, week: int) -> bool:
    return (
        topic_id in profile.get("stale_topics", [])
        and week >= int(profile.get("stale_after_week", 8))
    )


def _assessment_result(
    student: dict[str, Any],
    topic: dict[str, Any],
    week: int,
    difficulty: float,
    rng: random.Random,
    submitted_at: datetime,
) -> dict[str, Any]:
    topic_id = topic["id"]
    profile = student["profile"]
    if topic_id not in student["abilities"]:
        student["abilities"][topic_id] = _clamp(
            float(profile["ability"]) + rng.gauss(0, float(profile.get("topic_spread", 0.1))),
            0.08,
            0.97,
        )
    ability = student["abilities"][topic_id]
    theory_bonus = float(profile.get("theory_bonus", 0))
    if theory_bonus and not topic_id.startswith("chem-u3-"):
        ability = _clamp(ability + theory_bonus, 0.05, 0.98)
    declining_topics = set(profile.get("declining_topics", []))
    if topic_id in declining_topics:
        ability -= float(profile.get("decline_per_week", 0)) * week
    elif "trend" in profile:
        ability += float(profile["trend"]) * week

    effective_difficulty = _clamp(
        difficulty + (0.06 if topic["parent_id"] == "chem-u3" else 0),
        0.05,
        0.95,
    )
    expected = 1 / (1 + math.exp(-6 * (ability - effective_difficulty)))
    observed = _clamp(expected + rng.gauss(0, float(profile.get("noise", 0.1))), 0, 1)
    error_topics = set(profile.get("error_topics", []))
    error_type = "none"
    if topic_id in error_topics:
        error_type = "calculation" if rng.random() < 0.72 else "careless"
        observed = min(observed, _clamp(ability - rng.uniform(0.04, 0.19), 0, 1))
    elif observed < 0.4:
        error_type = rng.choice(("conceptual", "careless"))
    elif observed < 0.62:
        error_type = "unit_conversion" if topic_id.startswith("chem-u3-") else "careless"

    marks_total = 10
    marks_awarded = round(observed * marks_total, 1)
    return {
        "topic_id": topic_id,
        "marks_awarded": marks_awarded,
        "marks_total": marks_total,
        "difficulty": round(effective_difficulty, 4),
        "error_type": error_type,
        "time_spent_sec": rng.randint(75, 480),
    }


def _completion_events(
    student: dict[str, Any],
    histories: dict[str, list[dict[str, Any]]],
    reference_date: date,
    rng: random.Random,
) -> list[dict[str, Any]]:
    completed: list[dict[str, Any]] = []
    stale_topics = set(student["profile"].get("stale_topics", []))
    candidates = sorted(
        topic_id
        for topic_id, history in histories.items()
        if history and topic_id not in stale_topics
    )
    for topic_id in rng.sample(candidates, min(6, len(candidates))):
        week = rng.randrange(8)
        completed_at = datetime.combine(
            reference_date - timedelta(weeks=7 - week, days=student["day_offset"]),
            time(hour=18, minute=30),
            tzinfo=DEFAULT_TIMEZONE,
        )
        practical_done = rng.random() < 0.35
        completed.append(
            Component1CompletionEvent(
                event_id=str(
                    uuid5(
                        EVENT_NAMESPACE,
                        f"completion:{student['student_id']}:{topic_id}:{completed_at.isoformat()}",
                    )
                ),
                student_id=student["student_id"],
                topic_id=topic_id,
                status="completed",
                completed_at=completed_at,
                practical_done=practical_done,
                post_lab_score=round(rng.uniform(0.35, 1), 2) if practical_done else None,
            ).model_dump(mode="json")
        )
    return completed


def _teacher_rankings(
    students: list[dict[str, Any]],
    topics: list[dict[str, Any]],
    histories: dict[str, dict[str, list[dict[str, Any]]]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for student in students:
        student_label = student.get("synthetic_id", student["name"])
        topic_scores: list[tuple[str, float]] = []
        for topic in topics:
            history = histories[student["student_id"]][topic["id"]]
            if history:
                average_score = sum(item["score"] for item in history) / len(history)
            else:
                average_score = 0.5
            stale_boost = 0.16 if len(history) and history[-1]["week"] < 8 else 0
            weakness = 1 - average_score + stale_boost
            topic_scores.append((topic["id"], weakness))
        ordered = sorted(topic_scores, key=lambda item: (-item[1], item[0]))
        topic_weights = {topic["id"]: topic["exam_weight"] for topic in topics}
        for rank, (topic_id, _) in enumerate(ordered, start=1):
            exam_weight = float(topic_weights[topic_id])
            rows.append(
                {
                    "student_id": student["student_id"],
                    "student": student_label,
                    "topic_id": topic_id,
                    "rank": rank,
                    "exam_weight": exam_weight if exam_weight > 0 else 0.7,
                }
            )
    return rows


def _training_rows(
    topics: list[dict[str, Any]],
    histories: dict[str, dict[str, list[dict[str, Any]]]],
    students: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    labels_by_id = {
        student["student_id"]: student.get("synthetic_id", student["name"])
        for student in students
    }
    for student_id in sorted(histories):
        for topic in topics:
            history = histories[student_id][topic["id"]]
            prior_scores: list[float] = []
            for item in history:
                prior_scores.append(item["score"])
                features = {
                    "difficulty": item["difficulty"],
                    "error_type": item["error_type"],
                    "evidence_count": len(prior_scores),
                    "mean_score": round(sum(prior_scores) / len(prior_scores), 4),
                    "time_spent_sec": item["time_spent_sec"],
                }
                rows.append(
                    {
                        "student_id": student_id,
                        "student": labels_by_id[student_id],
                        "topic_id": topic["id"],
                        "week": item["week"],
                        "score": round(item["score"], 4),
                        "max_score": 1,
                        "observed_at": item["observed_at"],
                        "difficulty": item["difficulty"],
                        "features": json.dumps(features, sort_keys=True, separators=(",", ":")),
                    }
                )
    return rows


def _demo_mark_events(student: dict[str, Any], reference_date: date) -> tuple[dict[str, Any], dict[str, Any]]:
    topic_id = "chem-u3-molar-mass"
    sample_time = datetime.combine(reference_date, time(16, 0), tzinfo=DEFAULT_TIMEZONE)

    def sample(label: str, marks: float, week: int) -> dict[str, Any]:
        return Component2AssessmentEvent(
            event_id=str(uuid5(EVENT_NAMESPACE, f"demo:{student['student_id']}:{label}")),
            student_id=student["student_id"],
            paper_id=f"DEMO-{label.upper()}-CHEM-CALCULATIONS",
            source="past_paper",
            submitted_at=sample_time - timedelta(weeks=week),
            results=[
                {
                    "topic_id": topic_id,
                    "marks_awarded": marks,
                    "marks_total": 10,
                    "difficulty": 0.6,
                    "error_type": "calculation" if marks < 5 else "none",
                    "time_spent_sec": 280,
                }
            ],
        ).model_dump(mode="json")

    return sample("low-mark", 2, 0), sample("high-mark", 9, 1)


def _as_rows(value: list[dict[str, Any]] | dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise TypeError("Expected tabular dataset output.")
    return value


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _print_counts(counts: dict[str, int], output_dir: Path, *, dry_run: bool) -> None:
    action = "Would write" if dry_run else "Wrote"
    print(f"{action} datasets {'to' if not dry_run else 'under'} {output_dir}:")
    for filename, count in counts.items():
        print(f"  {filename}: {count} records")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--topics", type=Path, default=DEFAULT_TOPICS_PATH)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--seed", type=int, help="Override seed in demo_students.json.")
    parser.add_argument("--dry-run", action="store_true", help="Print output counts without writing files.")
    arguments = parser.parse_args()

    try:
        outputs = generate_datasets(arguments.config, arguments.topics, seed=arguments.seed)
        counts = count_datasets(outputs)
        if not arguments.dry_run:
            counts = write_datasets(outputs, arguments.output_dir)
    except (OSError, TypeError, ValueError) as exc:
        parser.error(str(exc))
    _print_counts(counts, arguments.output_dir, dry_run=arguments.dry_run)


if __name__ == "__main__":
    main()
