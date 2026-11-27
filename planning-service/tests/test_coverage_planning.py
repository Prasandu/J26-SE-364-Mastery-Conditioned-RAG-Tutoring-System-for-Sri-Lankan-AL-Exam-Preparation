"""PL-008 / PL-009 without a database: self-reported syllabus coverage in manual plans,
its validation, its effect on priority and activity, and the evidence-source label."""

from datetime import date, timedelta
from typing import Any

import pytest
from pydantic import ValidationError

from app.schemas.plans import PlanInput
from app.schemas.tasks import TaskReason
from app.services.plans import _manual_priority
from app.services.priority import coverage_activity
from app.services.task_content import build_task_reason
from app.services.weights import COVERAGE_PRIORITY_FLOOR

MOLE, GASES = "chem-u3-mole-concept", "chem-u4-ideal-gas-equation"


def plan(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "mode": "manual",
        "exam_date": (date.today() + timedelta(days=90)).isoformat(),
        "target_grade": "A",
        "topics": [MOLE, GASES],
        "availability_windows": [{"weekday": 1, "start_time": "16:00", "end_time": "18:00"}],
        "max_session_minutes": 60,
        "coverage": [{"topic_id": MOLE, "covered_percent": 30, "need": "learn_new"}],
    }
    data.update(overrides)
    return data


def test_coverage_is_accepted_for_manual_plans():
    parsed = PlanInput.model_validate(plan())

    assert parsed.coverage[0].covered_percent == 30 and parsed.coverage[0].need == "learn_new"


@pytest.mark.parametrize(
    "overrides,message",
    [
        ({"mode": "predicted", "topics": []}, "manual plans"),
        ({"coverage": [{"topic_id": "chem-u9-unknown", "covered_percent": 10}]}, "selected topics"),
        (
            {
                "coverage": [
                    {"topic_id": MOLE, "covered_percent": 10},
                    {"topic_id": MOLE, "covered_percent": 20},
                ]
            },
            "duplicate",
        ),
        ({"coverage": [{"topic_id": MOLE, "covered_percent": 101}]}, "less than or equal"),
        ({"coverage": [{"topic_id": MOLE, "covered_percent": -1}]}, "greater than or equal"),
        ({"coverage": [{"topic_id": MOLE, "covered_percent": 50, "need": "cram"}]}, "need"),
    ],
)
def test_invalid_coverage_is_refused(overrides, message):
    with pytest.raises(ValidationError, match=message):
        PlanInput.model_validate(plan(**overrides))


def test_priority_falls_with_reported_coverage_but_never_to_zero():
    class Covered:
        def __init__(self, percent):
            self.covered_percent = percent

    untouched = _manual_priority(MOLE, 0.8, None)
    none_covered = _manual_priority(MOLE, 0.8, Covered(0))
    partly = _manual_priority(MOLE, 0.8, Covered(30))
    fully = _manual_priority(MOLE, 0.8, Covered(100))

    assert untouched == {"topic_id": MOLE, "priority": 0.8, "reason": "Manually prioritized by the student."}
    assert none_covered["priority"] == 0.8
    assert partly["priority"] == pytest.approx(
        0.8 * (COVERAGE_PRIORITY_FLOOR + (1 - COVERAGE_PRIORITY_FLOOR) * 0.7)
    )
    assert fully["priority"] == pytest.approx(0.8 * COVERAGE_PRIORITY_FLOOR)
    assert fully["priority"] > 0
    assert none_covered["priority"] > partly["priority"] > fully["priority"]
    assert "70% of the topic still to cover" in partly["reason"]
    assert "fully covered" in fully["reason"]


@pytest.mark.parametrize(
    "percent,need,activity",
    [
        (0, None, "theory"),
        (60, None, "theory"),
        (100, None, "guided_practice"),
        (100, "repeat_theory", "theory"),
        (20, "past_papers", "past_paper"),
        (80, "exam_sprint", "past_paper"),
        (50, "laboratory", "guided_practice"),
    ],
)
def test_coverage_activity(percent, need, activity):
    assert coverage_activity(percent, need) == activity


def reason(**overrides):
    base = {
        "topic_name": "Mole concept",
        "sub_topic_name": None,
        "mastery": 0.3,
        "has_evidence": False,
        "trend": 0.0,
        "decline": None,
        "exam_weight": 0.5,
        "days_to_exam": 60,
        "main_factors": {},
        "activity": "theory",
    }
    base.update(overrides)
    return TaskReason.model_validate(build_task_reason(**base))


def test_the_reason_says_self_reported_and_never_presents_coverage_as_a_mark():
    explained = reason(
        evidence_source="self_reported_coverage",
        coverage={"topic_id": MOLE, "covered_percent": 30, "need": "learn_new", "source": "self_reported"},
    )

    assert explained.evidence_source == "self_reported_coverage"
    assert explained.self_reported_coverage == 30 and explained.coverage_need == "learn_new"
    assert explained.has_evidence is False  # the 0.3 is only the planner's neutral prior
    assert "self-reported, not a mark" in explained.reason


def test_results_drive_the_reason_once_marks_exist():
    explained = reason(
        has_evidence=True,
        evidence_source="results",
        coverage={"topic_id": MOLE, "covered_percent": 30, "need": None},
    )

    assert explained.evidence_source == "results"
    assert explained.reason == "Based on your recent results and topic priorities."
    assert explained.self_reported_coverage == 30  # still shown, as a separate signal


def test_older_reasons_without_a_source_default_safely():
    assert reason().evidence_source == "no_evidence"
    assert reason(has_evidence=True).evidence_source == "results"
