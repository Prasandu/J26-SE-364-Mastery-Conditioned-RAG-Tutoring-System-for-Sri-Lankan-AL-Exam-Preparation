from __future__ import annotations

from datetime import UTC, datetime
from math import isfinite

from sqlalchemy import select

from app.models import LearnerTopicState, Prediction, StudyPlan, StudyTask, Topic
from app.schemas.dashboard import DashboardResponse, WhatIfInput, WhatIfResponse


def get_dashboard(session, student_id: str, *, as_of: datetime | None = None) -> DashboardResponse:
    now = (as_of or datetime.now(UTC)).astimezone(UTC)
    plans = _all(session, select(StudyPlan).where(StudyPlan.student_id == student_id))
    plan = _latest_plan(plans)
    exam_date = (plan.exam_date if plan is not None else now.date())
    exam_countdown_days = max((exam_date - now.date()).days, 0)

    tasks = _all(session, select(StudyTask).where(StudyTask.student_id == student_id))
    planned_minutes = sum(float(task.duration_min) for task in tasks)
    completed_minutes = sum(
        float(task.actual_duration_min or 0)
        for task in tasks
        if task.status in {"completed", "partial"}
    )
    adherence = completed_minutes / planned_minutes if planned_minutes else 0.0

    topics_by_id = {topic.id: topic for topic in _all(session, select(Topic))}
    states = _all(session, select(LearnerTopicState).where(LearnerTopicState.student_id == student_id))
    mastery_trend = []
    for state in sorted(states, key=lambda item: item.weak_score, reverse=True):
        topic = topics_by_id.get(state.topic_id)
        mastery_trend.append(
            {
                "topic_id": state.topic_id,
                "topic_name": getattr(topic, "name", None),
                "parent_topic_id": getattr(topic, "parent_id", None),
                "mastery": _clamp(float(state.mastery)),
                "trend": _clamp(float(state.trend)),
            }
        )
    if not mastery_trend:
        mastery_trend = [
            {
                "topic_id": "n/a",
                "topic_name": "No evidence yet",
                "parent_topic_id": None,
                "mastery": 0.0,
                "trend": 0.0,
            }
        ]

    weak_topics = []
    for state in sorted(states, key=lambda item: item.weak_score, reverse=True)[:5]:
        topic = topics_by_id.get(state.topic_id)
        weak_topics.append(
            {
                "topic_id": state.topic_id,
                "topic_name": getattr(topic, "name", None),
                "mastery": _clamp(float(state.mastery)),
                "weakness_score": _clamp(float(state.weak_score)),
                "reason": _weak_reason(topic, state),
            }
        )

    current_prediction = _current_prediction_score(session, student_id)
    target_grade = (plan.target_grade if plan is not None else "B")
    current_grade = _grade_for(current_prediction)
    target_score = _grade_target_score(target_grade)
    gap_to_target = current_prediction - target_score
    grade_gap_to_target = gap_to_target
    readiness_score = current_prediction

    return DashboardResponse(
        exam_countdown_days=exam_countdown_days,
        adherence=adherence,
        adherence_pct=adherence * 100,
        mastery_trend=mastery_trend,
        weak_topics=weak_topics,
        predicted_grade=current_grade,
        target_grade=target_grade,
        gap_to_target=gap_to_target,
        grade_gap_to_target=grade_gap_to_target,
        predicted_score=current_prediction,
        readiness_score=readiness_score,
        current_prediction=current_prediction,
    )


def project_what_if(
    session,
    student_id: str,
    data: WhatIfInput,
    *,
    as_of: datetime | None = None,
) -> WhatIfResponse:
    current_prediction = _current_prediction_score(session, student_id)
    current_grade = _grade_for(current_prediction)
    target_grade = _target_grade_for_student(session, student_id)
    target_score = _grade_target_score(target_grade)
    extra_hours = (
        data.extra_hours_per_week
        if data.extra_hours_per_week is not None
        else data.hours_per_week or 0.0
    )
    mastery_gain = data.mastery_gain or 0.0
    uplift = min(0.2, (extra_hours / 10.0) * 0.06 + mastery_gain * 0.25)
    projected_prediction = max(current_prediction, min(1.0, current_prediction + uplift))
    projected_grade = _grade_for(projected_prediction)
    gain = projected_prediction - current_prediction
    return WhatIfResponse(
        current_prediction=current_prediction,
        current_grade=current_grade,
        projected_prediction=projected_prediction,
        projected_grade=projected_grade,
        gain=gain,
        change=gain,
        estimate=True,
        target_grade=target_grade,
        gap_to_target=projected_prediction - target_score,
    )


def _all(session, statement):
    try:
        return list(session.scalars(statement).all())
    except AttributeError:
        return []


def _latest_plan(plans):
    if not plans:
        return None
    return max(plans, key=lambda plan: getattr(plan, "updated_at", getattr(plan, "exam_date", None)))


def _current_prediction_score(session, student_id: str) -> float:
    latest = _all(session, select(Prediction).where(Prediction.student_id == student_id))
    for row in reversed(latest):
        if getattr(row, "topic_id", None) is None:
            value = float(getattr(row, "predicted_score", 0.0))
            if isfinite(value):
                return _clamp(value)
    states = _all(session, select(LearnerTopicState).where(LearnerTopicState.student_id == student_id))
    if not states:
        return 0.5
    return _clamp(sum(float(state.mastery) for state in states) / len(states))


def _target_grade_for_student(session, student_id: str) -> str:
    plans = _all(session, select(StudyPlan).where(StudyPlan.student_id == student_id))
    if plans:
        return getattr(_latest_plan(plans), "target_grade", "B")
    return "B"


def _grade_for(score: float) -> str:
    score = _clamp(score)
    if score >= 0.75:
        return "A"
    if score >= 0.65:
        return "B"
    if score >= 0.5:
        return "C"
    if score >= 0.35:
        return "S"
    return "F"


def _grade_target_score(grade: str) -> float:
    mapping = {"A": 0.75, "B": 0.65, "C": 0.5, "S": 0.35, "F": 0.0}
    return mapping.get(grade.upper(), 0.65)


def _weak_reason(topic, state) -> str:
    if topic is None:
        return "Needs more topic evidence to improve confidence."
    mastery = float(state.mastery)
    trend = float(state.trend)
    if mastery < 0.45:
        return f"{topic.name} is below target mastery and needs more regular review."
    if trend < 0:
        return f"{topic.name} is trending downward; revisit prior mistakes and spacing."
    return f"{topic.name} needs reinforcement to sustain steady improvement."


def _clamp(value: float, *, minimum: float = 0.0, maximum: float = 1.0) -> float:
    if not isfinite(value):
        return minimum
    return max(minimum, min(maximum, value))
