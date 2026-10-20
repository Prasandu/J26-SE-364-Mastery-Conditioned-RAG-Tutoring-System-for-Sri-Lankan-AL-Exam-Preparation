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


def test_official_catalogue_has_exam_weights_for_every_topic() -> None:
    catalogue_path = Path(__file__).resolve().parents[2] / "shared" / "contracts" / "topics.json"

    topic_by_id = {topic["id"]: topic for topic in load_topics(catalogue_path)}

    assert all(0 < topic["exam_weight"] <= 1 for topic in topic_by_id.values())
    assert topic_by_id["chem-u6"]["exam_weight"] == 1.0
    # Heavyweight units outrank foundation units at the leaf level the planner schedules.
    assert topic_by_id["chem-u12-kc"]["exam_weight"] > topic_by_id["chem-u1-neutrons"]["exam_weight"]


def test_unit_mark_share_is_split_across_leaves_and_rescaled_per_level(tmp_path) -> None:
    source = tmp_path / "topics.json"
    source.write_text(
        json.dumps(
            {
                "units": [
                    {
                        "id": "big",
                        "name": "Big unit",
                        "exam_mark_share": 20,
                        "topics": [
                            {
                                "id": "big-group",
                                "name": "Group",
                                "topics": [
                                    {"id": "big-a", "name": "A"},
                                    {"id": "big-b", "name": "B"},
                                ],
                            },
                            {"id": "big-c", "name": "C"},
                            {"id": "big-d", "name": "D"},
                        ],
                    },
                    {
                        "id": "small",
                        "name": "Small unit",
                        "exam_mark_share": 10,
                        "topics": [{"id": "small-a", "name": "A"}],
                    },
                    {
                        "id": "authored",
                        "name": "Authored unit",
                        "exam_weight": 0.3,
                        "exam_mark_share": 40,
                        "topics": [{"id": "authored-a", "name": "A", "exam_weight": 0.9}],
                    },
                ]
            }
        ),
        encoding="utf-8",
    )

    weights = {topic["id"]: topic["exam_weight"] for topic in load_topics(source)}

    # Units: 20 / 10 / 40 rescaled by the largest share, but authored weights win.
    assert weights["big"] == 0.5 and weights["small"] == 0.25 and weights["authored"] == 0.3
    # Leaves: big has 4 leaves (5% each), small has 1 (10%), authored has 1 (40%).
    assert weights["small-a"] == 0.25
    assert weights["big-a"] == weights["big-c"] == 0.125
    assert weights["authored-a"] == 0.9
    # The only group holds 2 of big's 4 leaves.
    assert weights["big-group"] == 1.0


def test_negative_mark_share_is_rejected(tmp_path) -> None:
    source = tmp_path / "topics.json"
    source.write_text(
        json.dumps({"units": [{"id": "u", "name": "U", "exam_mark_share": -1, "topics": []}]}),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="exam_mark_share"):
        load_topics(source)
