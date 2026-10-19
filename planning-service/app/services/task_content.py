from math import ceil
from typing import Any


def build_task_reason(
    *,
    topic_name: str,
    sub_topic_name: str | None,
    mastery: float,
    trend: float,
    decline: Any | None,
    exam_weight: float,
    days_to_exam: int,
    main_factors: dict[str, float],
    activity: str,
) -> dict[str, Any]:
    recommendations = {
        "theory": "Learn the theory, then practise questions on this topic.",
        "guided_practice": "Work through guided practice questions on this topic.",
        "structured_questions": "Complete structured questions on this topic.",
        "past_paper": "Practise past-paper questions on this topic.",
        "error_review": "Review your mistakes, then retry related questions.",
        "spaced_revision": "Refresh your notes, then test your recall with questions.",
        "recovery_revision": "Revise your notes, then redo questions from this topic.",
    }
    decline_alert = (
        {
            "baseline": decline.baseline,
            "recent": decline.recent,
            "drop": decline.drop,
            "message": decline.message,
        }
        if decline is not None
        else None
    )
    return {
        "topic": topic_name,
        "sub_topic": sub_topic_name,
        "mastery": mastery,
        "trend": trend,
        "decline_alert": decline_alert,
        "exam_weight": exam_weight,
        "days_to_exam": days_to_exam,
        "main_factors": main_factors,
        "activity_recommendation": recommendations.get(
            activity,
            "Study this topic using the recommended practice questions.",
        ),
    }


def build_activity_steps(
    *,
    duration_minutes: int,
    mastery: float,
    studied: bool,
    activity: str,
    declining: bool,
    question_ids: tuple[str, ...],
) -> list[dict[str, Any]]:
    needs_theory = not studied or mastery < 0.45 or activity == "theory"
    needs_review = declining or activity in {"error_review", "spaced_revision"}
    kinds = [
        kind
        for kind, needed in (
            ("theory", needs_theory),
            ("practice", True),
            ("review", needs_review),
        )
        if needed
    ]
    if duration_minutes < len(kinds):
        kinds = ["practice"] if duration_minutes == 1 else kinds[:duration_minutes]
    weights = {"theory": 0.4, "practice": 0.6, "review": 0.25}
    remaining = duration_minutes - len(kinds)
    total_weight = sum(weights[kind] for kind in kinds)
    allocations = {kind: 1 + int(remaining * weights[kind] / total_weight) for kind in kinds}
    left = duration_minutes - sum(allocations.values())
    for kind in reversed(kinds):
        if left == 0:
            break
        allocations[kind] += 1
        left -= 1

    steps = []
    practice_question_ids: list[str] = []
    for kind in kinds:
        minutes = allocations[kind]
        step: dict[str, Any] = {"kind": kind, "minutes": minutes, "question_ids": []}
        if kind == "practice" and question_ids:
            practice_question_ids = list(question_ids[: max(1, ceil(minutes / 6))])
            step["question_ids"] = practice_question_ids
        elif kind == "review":
            step["question_ids"] = practice_question_ids
        steps.append(step)
    return steps
