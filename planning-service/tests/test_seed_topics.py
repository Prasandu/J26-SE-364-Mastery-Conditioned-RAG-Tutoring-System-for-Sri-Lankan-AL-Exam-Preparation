import json
from pathlib import Path

import pytest

from scripts.seed_topics import load_topics


def test_load_official_catalogue_as_three_levels() -> None:
    catalogue_path = Path(__file__).resolve().parents[2] / "shared" / "contracts" / "topics.json"

    topics = load_topics(catalogue_path)
    topic_by_id = {topic["id"]: topic for topic in topics}

    assert sum(topic["parent_id"] is None for topic in topics) == 14
    assert topic_by_id["chem-u1-electronic-configurations"]["parent_id"] == "chem-u1"
    assert topic_by_id["chem-u1-orbitals"]["parent_id"] == "chem-u1-electronic-configurations"
    assert topic_by_id["chem-u14-ammonia"]["grade_level"] == "13"


def test_load_topics_orders_parents_before_children(tmp_path) -> None:
    source = tmp_path / "topics.json"
    source.write_text(
        json.dumps(
            {
                "topics": [
                    {
                        "id": "CHEM.CALC.MOLE",
                        "name": "The mole",
                        "parent_id": "CHEM.CALC",
                        "exam_weight": 0.3,
                        "prerequisites": [],
                    },
                    {
                        "id": "CHEM.CALC",
                        "name": "Calculations",
                        "parent_id": None,
                        "exam_weight": 0.6,
                        "prerequisites": [],
                    },
                ]
            }
        ),
        encoding="utf-8",
    )

    topics = load_topics(source)

    assert [topic["id"] for topic in topics] == ["CHEM.CALC", "CHEM.CALC.MOLE"]


@pytest.mark.parametrize(
    ("topics", "message"),
    [
        ([{"id": "A", "name": "A", "parent_id": "MISSING"}], "missing parent"),
        (
            [
                {"id": "A", "name": "A", "parent_id": "B"},
                {"id": "B", "name": "B", "parent_id": "A"},
            ],
            "parent cycle",
        ),
        ([{"id": "A", "name": "A", "exam_weight": 1.5}], "between 0 and 1"),
        ([{"id": "A", "name": "A", "prerequisites": ["MISSING"]}], "missing prerequisite"),
    ],
)
def test_load_topics_rejects_invalid_hierarchy(tmp_path, topics, message) -> None:
    source = tmp_path / "topics.json"
    source.write_text(json.dumps(topics), encoding="utf-8")

    with pytest.raises(ValueError, match=message):
        load_topics(source)
