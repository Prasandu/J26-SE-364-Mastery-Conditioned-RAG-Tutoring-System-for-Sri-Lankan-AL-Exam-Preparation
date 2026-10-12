import argparse
import json
import math
import random
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from scripts.seed_topics import load_topics

STUDENT_COUNT = 20
WEEK_COUNT = 8
QUESTIONS_PER_TOPIC = 8


def generate_mock_data(topics_path: Path, seed: int = 364) -> tuple[list[dict], list[dict]]:
    topics = load_topics(topics_path)
    parent_ids = {topic["parent_id"] for topic in topics if topic["parent_id"] is not None}
    assessable_topics = [topic for topic in topics if topic["id"] not in parent_ids]
    if not assessable_topics:
        raise ValueError("Topic catalogue has no leaf topics to assess.")

    rng = random.Random(seed)
    events: list[dict[str, Any]] = []
    hidden_abilities: list[dict[str, Any]] = []
    start = datetime(2026, 1, 5, 9, 0, tzinfo=UTC)

    for student_number in range(1, STUDENT_COUNT + 1):
        student_id = f"mock-student-{student_number:02d}"
        base_ability = rng.uniform(0.25, 0.85)
        student_abilities = {
            topic["id"]: min(0.98, max(0.05, base_ability + rng.gauss(0, 0.12)))
            for topic in assessable_topics
        }
        hidden_abilities.extend(
            {"student_id": student_id, "topic_id": topic_id, "true_ability": round(ability, 4)}
            for topic_id, ability in student_abilities.items()
        )

        for week in range(WEEK_COUNT):
            paper_difficulty = rng.uniform(0.2, 0.8)
            evidence = []
            for topic in assessable_topics:
                ability = student_abilities[topic["id"]]
                expected = 1 / (1 + math.exp(-6 * (ability - paper_difficulty)))
                observed = min(1.0, max(0.0, expected + rng.gauss(0, 0.12)))
                evidence.append(
                    {
                        "topic_id": topic["id"],
                        "score": round(observed * QUESTIONS_PER_TOPIC),
                        "max_score": QUESTIONS_PER_TOPIC,
                        "difficulty": round(paper_difficulty, 4),
                    }
                )

            occurred_at = start + timedelta(weeks=week, days=student_number % 7)
            events.append(
                {
                    "event_id": f"mock-{student_id}-week-{week + 1:02d}",
                    "student_id": student_id,
                    "occurred_at": occurred_at.isoformat(),
                    "evidence": evidence,
                }
            )

    return events, hidden_abilities


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as output:
        for row in rows:
            output.write(json.dumps(row, separators=(",", ":")) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic assessment events for 20 students over 8 weeks."
    )
    parser.add_argument(
        "--topics",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "shared" / "contracts" / "topics.json",
    )
    parser.add_argument("--output-dir", type=Path, default=Path("data/mock"))
    parser.add_argument("--seed", type=int, default=364)
    args = parser.parse_args()

    events, hidden_abilities = generate_mock_data(args.topics, seed=args.seed)
    write_jsonl(args.output_dir / "assessment_events.jsonl", events)
    write_jsonl(args.output_dir / "hidden_abilities.jsonl", hidden_abilities)
    print(
        f"Wrote {len(events)} assessment events and "
        f"{len(hidden_abilities)} hidden topic abilities to {args.output_dir}"
    )


if __name__ == "__main__":
    main()
