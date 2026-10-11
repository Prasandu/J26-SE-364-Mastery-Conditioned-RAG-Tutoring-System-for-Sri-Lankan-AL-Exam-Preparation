import argparse
import json
from pathlib import Path
from typing import Any

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Topic

DEFAULT_TOPICS_PATH = Path(__file__).resolve().parents[2] / "shared" / "contracts" / "topics.json"


def load_topics(path: Path) -> list[dict[str, Any]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"Topic file does not exist: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Topic file is not valid JSON: {path}") from exc

    topics = _flatten_catalogue(data)
    if not isinstance(topics, list):
        raise ValueError("Topic JSON must be an array or an object with a 'topics' array.")

    validated: dict[str, dict[str, Any]] = {}
    for index, item in enumerate(topics):
        if not isinstance(item, dict):
            raise ValueError(f"Topic at index {index} must be an object.")

        topic_id = item.get("id")
        name = item.get("name")
        code = item.get("code")
        description = item.get("description")
        parent_id = item.get("parent_id")
        grade_level = item.get("grade_level")
        exam_weight = item.get("exam_weight", 0)
        prerequisites = item.get("prerequisites", [])

        if not isinstance(topic_id, str) or not topic_id.strip():
            raise ValueError(f"Topic at index {index} requires a non-empty string id.")
        if not isinstance(name, str) or not name.strip():
            raise ValueError(f"Topic {topic_id!r} requires a non-empty string name.")
        if code is not None and not isinstance(code, str):
            raise ValueError(f"Topic {topic_id!r} code must be a string.")
        if description is not None and not isinstance(description, str):
            raise ValueError(f"Topic {topic_id!r} description must be a string.")
        if parent_id is not None and (not isinstance(parent_id, str) or not parent_id.strip()):
            raise ValueError(f"Topic {topic_id!r} has an invalid parent_id.")
        if grade_level is not None and not isinstance(grade_level, str):
            raise ValueError(f"Topic {topic_id!r} grade_level must be a string.")
        if isinstance(exam_weight, bool) or not isinstance(exam_weight, (int, float)):
            raise ValueError(f"Topic {topic_id!r} exam_weight must be a number.")
        if not 0 <= exam_weight <= 1:
            raise ValueError(f"Topic {topic_id!r} exam_weight must be between 0 and 1.")
        if not isinstance(prerequisites, list) or any(
            not isinstance(prerequisite, str) or not prerequisite.strip() for prerequisite in prerequisites
        ):
            raise ValueError(f"Topic {topic_id!r} prerequisites must be an array of topic IDs.")
        if topic_id in validated:
            raise ValueError(f"Duplicate topic ID: {topic_id}")

        validated[topic_id] = {
            "id": topic_id,
            "name": name,
            "code": code,
            "description": description,
            "parent_id": parent_id,
            "grade_level": grade_level,
            "exam_weight": float(exam_weight),
            "prerequisites": prerequisites,
        }

    for topic in validated.values():
        parent_id = topic["parent_id"]
        if parent_id is not None and parent_id not in validated:
            raise ValueError(f"Topic {topic['id']!r} refers to missing parent {parent_id!r}.")
        for prerequisite in topic["prerequisites"]:
            if prerequisite not in validated:
                raise ValueError(f"Topic {topic['id']!r} refers to missing prerequisite {prerequisite!r}.")

    return _parent_first_order(validated)


def _flatten_catalogue(data: Any) -> Any:
    if not isinstance(data, dict) or "units" not in data:
        return data.get("topics") if isinstance(data, dict) else data

    units = data["units"]
    if not isinstance(units, list):
        raise ValueError("Topic catalogue 'units' must be an array.")

    flattened: list[dict[str, Any]] = []
    for unit in units:
        if not isinstance(unit, dict):
            raise ValueError("Each catalogue unit must be an object.")
        unit_record = {key: value for key, value in unit.items() if key != "topics"}
        flattened.append(unit_record | {"parent_id": None, "prerequisites": []})
        _flatten_children(
            unit.get("topics", []),
            parent_id=unit_record.get("id"),
            grade_level=unit_record.get("grade_level"),
            flattened=flattened,
            depth=2,
        )
    return flattened


def _flatten_children(
    children: Any,
    *,
    parent_id: Any,
    grade_level: Any,
    flattened: list[dict[str, Any]],
    depth: int,
) -> None:
    if not isinstance(children, list):
        raise ValueError("Nested topic entries must be arrays.")
    for child in children:
        if not isinstance(child, dict):
            raise ValueError("Each nested topic must be an object.")
        nested = child.get("topics", [])
        if depth == 3 and nested:
            raise ValueError("Topic hierarchy cannot exceed three levels.")
        child_record = {key: value for key, value in child.items() if key != "topics"}
        child_record.setdefault("grade_level", grade_level)
        flattened.append(child_record | {"parent_id": parent_id, "prerequisites": []})
        if nested:
            _flatten_children(
                nested,
                parent_id=child_record.get("id"),
                grade_level=child_record.get("grade_level"),
                flattened=flattened,
                depth=depth + 1,
            )


def _parent_first_order(topics: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    ordered: list[dict[str, Any]] = []
    added: set[str] = set()
    remaining = dict(topics)

    while remaining:
        ready = [
            topic for topic in remaining.values() if topic["parent_id"] is None or topic["parent_id"] in added
        ]
        if not ready:
            unresolved = ", ".join(sorted(remaining))
            raise ValueError(f"Topic hierarchy contains a parent cycle: {unresolved}")

        for topic in ready:
            ordered.append(topic)
            added.add(topic["id"])
            del remaining[topic["id"]]

    return ordered


def seed_topics(session: Session, topics: list[dict[str, Any]]) -> int:
    for topic in topics:
        statement = insert(Topic).values(**topic)
        statement = statement.on_conflict_do_update(
            index_elements=[Topic.id],
            set_={
                "name": statement.excluded.name,
                "code": statement.excluded.code,
                "description": statement.excluded.description,
                "parent_id": statement.excluded.parent_id,
                "grade_level": statement.excluded.grade_level,
                "exam_weight": statement.excluded.exam_weight,
                "prerequisites": statement.excluded.prerequisites,
            },
        )
        session.execute(statement)
    session.commit()
    return len(topics)


def main() -> None:
    parser = argparse.ArgumentParser(description="Load planning topics from shared topic JSON.")
    parser.add_argument("--file", type=Path, default=DEFAULT_TOPICS_PATH)
    args = parser.parse_args()
    topics = load_topics(args.file)

    with SessionLocal() as session:
        count = seed_topics(session, topics)

    print(f"Seeded {count} topics from {args.file}")


if __name__ == "__main__":
    main()
