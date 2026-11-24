"""Rolling-horizon roadmap: a forecast for every week until the exam.

The plan has three layers:

* Roadmap: hours per topic for every remaining week, labelled ``forecast``
  (or ``committed`` for weeks that overlap the detailed task window).
* Committed window: detailed tasks for the next ``committed_window_days``.
* Checkpoints: at the end of each window (or when new assessment evidence
  arrives) the roadmap and the next window are rebuilt from fresh data.

Rolling state is stored on ``plan.constraints["rolling"]`` so it travels with
the plan and needs no extra table.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from math import exp
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import NotFound
from app.models import (
    AvailabilitySlot,
    LearnerTopicState,
    ReplanLog,
    RoadmapWeek,
    StudyPlan,
    Topic,
)
from app.services.achievability import (
    TopicInput,
    allocate_hours,
    build_achievability_report,
    effective_exam_weight,
    expected_gain_per_hour,
    grade_for,
)
from app.services.topic_lookup import preload_topics
from app.services.weights import (
    ADHERENCE_FLOOR,
    CATCH_UP_BUFFER,
    COMPRESSED_SESSION_FACTOR,
    COMPRESSION_HEADROOM,
    COMPRESSION_MIN_LOAD,
    COMPRESSION_MIN_TOPIC_HOURS,
    FINAL_WEEK_DAYS,
    MIN_COMPRESSED_SESSION_MINUTES,
    NEUTRAL_PRIOR_MASTERY,
    REALISTIC_MAX_HOURS_PER_DAY,
    SHORT_HORIZON_DAYS,
    SHORT_HORIZON_THRESHOLD_DAYS,
    WINDOW_DAYS,
)

NO_NEW_THEORY_ACTIVITIES = frozenset(
    {"past_paper", "error_review", "spaced_revision", "recovery_revision"}
)


# ---------------------------------------------------------------------------
# Pure rules
# ---------------------------------------------------------------------------


def committed_window_days(days_to_exam: int) -> int:
    """Return how many days of detailed tasks to commit to.

    14 days normally, 7 when fewer than 21 days remain. The window never runs
    into the final week part-way: it is shortened so the final week always
    starts a fresh, fixed window that runs to the exam.
    """
    if days_to_exam <= 0:
        return 0
    if is_final_week(days_to_exam):
        return days_to_exam
    window = SHORT_HORIZON_DAYS if days_to_exam < SHORT_HORIZON_THRESHOLD_DAYS else WINDOW_DAYS
    if days_to_exam - window < FINAL_WEEK_DAYS:
        window = days_to_exam - FINAL_WEEK_DAYS
    return window


def is_final_week(days_to_exam: int) -> bool:
    """Return True when the student is in the final revision-only period."""
    return 0 < days_to_exam <= FINAL_WEEK_DAYS


def final_week_activity(activity: str, *, mastery: float, declining: bool, studied: bool) -> str:
    """Map an activity to its final-week equivalent: no new theory."""
    if activity in NO_NEW_THEORY_ACTIVITIES:
        return activity
    if declining:
        return "recovery_revision"
    if not studied or mastery >= 0.6:
        return "past_paper"
    return "error_review"


@dataclass(frozen=True)
class CompressionResult:
    kept: dict[str, float]
    dropped: tuple[str, ...]


def compress_allocation(
    allocation: dict[str, float],
    gain_by_topic: dict[str, float],
    budget_hours: float,
) -> CompressionResult:
    """Shrink the plan to ``budget_hours``, dropping the lowest-gain topics first.

    Every kept topic is scaled down to fit the budget. While that would leave a
    kept topic with less than ``COMPRESSION_MIN_TOPIC_HOURS`` a week, the
    lowest-gain topic is dropped instead. Only topics that currently receive
    hours are candidates, and the highest-gain topic is always kept.
    """
    active = {topic_id: hours for topic_id, hours in allocation.items() if hours > 0}
    lowest_gain_first = sorted(active, key=lambda topic_id: (gain_by_topic.get(topic_id, 0.0), topic_id))
    kept = dict(active)
    dropped: list[str] = []
    for topic_id in lowest_gain_first[:-1]:
        scale = min(budget_hours / sum(kept.values()), 1.0)
        if min(kept.values()) * scale >= COMPRESSION_MIN_TOPIC_HOURS:
            break
        kept.pop(topic_id)
        dropped.append(topic_id)
    scale = min(budget_hours / sum(kept.values()), 1.0) if kept else 1.0
    return CompressionResult(
        kept={topic_id: round(hours * scale, 2) for topic_id, hours in kept.items()},
        dropped=tuple(dropped),
    )


def compressed_load(adherence: float) -> float:
    """Share of the original weekly load kept after compression."""
    return min(1.0, max(adherence + COMPRESSION_HEADROOM, COMPRESSION_MIN_LOAD))


def topic_focus(mastery: float, *, final_week: bool) -> str:
    if final_week:
        return "revision and past papers"
    if mastery < 0.35:
        return "theory and practice"
    if mastery < 0.75:
        return "practice questions"
    return "past papers"


@dataclass
class RoadmapWeekData:
    week_start: date
    week_end: date
    label: str
    phase: str
    topics: list[dict[str, Any]]
    total_hours: float
    weeks_to_exam: int
    compressed: bool = False
    compression_note: str | None = None


def forecast_weeks(
    topics: list[TopicInput],
    *,
    daily_hours: dict[int, float],
    today: date,
    exam_date: date,
    window_end: date | None,
    deferred: frozenset[str] | set[str] = frozenset(),
    topic_names: dict[str, str] | None = None,
    compression_note: str | None = None,
) -> list[RoadmapWeekData]:
    """Project hours per topic for every week from ``today`` until the exam.

    Each week allocates that week's available hours by expected gain, then
    advances projected mastery, so the topic mix shifts as topics improve.
    """
    topic_names = topic_names or {}
    last_study_day = exam_date - timedelta(days=1)
    if last_study_day < today:
        return []
    final_start = exam_date - timedelta(days=FINAL_WEEK_DAYS)
    active = [topic for topic in topics if topic["topic_id"] not in deferred] or list(topics)
    mastery = {topic["topic_id"]: float(topic.get("mastery", NEUTRAL_PRIOR_MASTERY)) for topic in topics}

    weeks: list[RoadmapWeekData] = []
    week_start = _monday_of(today)
    last_monday = _monday_of(last_study_day)
    total_weeks = (last_monday - week_start).days // 7 + 1
    while week_start <= last_monday:
        first_day = max(week_start, today)
        last_day = min(week_start + timedelta(days=6), last_study_day)
        hours = sum(
            daily_hours.get((first_day + timedelta(days=offset)).weekday(), 0.0)
            for offset in range((last_day - first_day).days + 1)
        )
        final_week = last_day >= final_start
        inputs = [_projected_input(topic, mastery) for topic in active]
        allocation = allocate_hours(inputs, hours) if hours > 0 else {}
        gains = {item["topic_id"]: expected_gain_per_hour(item) for item in inputs}
        rows = [
            {
                "topic_id": topic_id,
                "topic_name": topic_names.get(topic_id, topic_id),
                "hours": round(topic_hours, 2),
                "focus": topic_focus(mastery[topic_id], final_week=final_week),
                "projected_mastery": round(mastery[topic_id], 3),
            }
            for topic_id, topic_hours in sorted(
                allocation.items(),
                key=lambda item: (-item[1], -gains.get(item[0], 0.0), item[0]),
            )
            if topic_hours > 0
        ]
        for item in inputs:
            topic_hours = allocation.get(item["topic_id"], 0.0)
            if topic_hours > 0:
                mastery[item["topic_id"]] = project_mastery(item, topic_hours)
        weeks.append(
            RoadmapWeekData(
                week_start=week_start,
                week_end=week_start + timedelta(days=6),
                label="committed" if window_end is not None and first_day <= window_end else "forecast",
                phase="final_revision" if final_week else "learning",
                topics=rows,
                total_hours=round(sum(row["hours"] for row in rows), 2),
                weeks_to_exam=total_weeks - 1 - len(weeks),
                compressed=bool(deferred),
                compression_note=compression_note if deferred else None,
            )
        )
        week_start += timedelta(weeks=1)
    return weeks


def project_mastery(topic: TopicInput, hours: float) -> float:
    """Advance mastery by ``hours`` of study with saturating returns."""
    current = float(topic.get("mastery", 0.0))
    if current >= 1:
        return 1.0
    rate = expected_gain_per_hour({**topic, "exam_weight": 1.0}) / (1 - current)
    return min(1.0, 1 - (1 - current) * exp(-rate * hours))


def daily_hours_by_weekday(slots: list[Any], daily_cap_minutes: int) -> dict[int, float]:
    """Available hours for each weekday, with the daily cap applied per day."""
    minutes: dict[int, int] = {}
    for slot in slots:
        duration = (
            slot.end_time.hour * 60
            + slot.end_time.minute
            - slot.start_time.hour * 60
            - slot.start_time.minute
        )
        minutes[slot.weekday] = minutes.get(slot.weekday, 0) + max(duration, 0)
    return {weekday: min(total, daily_cap_minutes) / 60 for weekday, total in minutes.items()}


# ---------------------------------------------------------------------------
# Rolling state on plan.constraints
# ---------------------------------------------------------------------------


def rolling_state(plan: Any) -> dict[str, Any]:
    constraints = getattr(plan, "constraints", None) or {}
    return dict(constraints.get("rolling") or {})


def set_rolling_state(plan: Any, **updates: Any) -> dict[str, Any]:
    """Merge ``updates`` into the rolling state, reassigning JSONB so it is persisted."""
    state = {**rolling_state(plan), **updates}
    plan.constraints = {**plan.constraints, "rolling": state}
    return state


def start_window(plan: Any, *, today: date, window_days: int, now: datetime) -> dict[str, Any]:
    window_end = min(today + timedelta(days=max(window_days, 1) - 1), plan.exam_date - timedelta(days=1))
    return set_rolling_state(
        plan,
        window_start=today.isoformat(),
        window_end=window_end.isoformat(),
        window_days=window_days,
        last_checkpoint_at=now.isoformat(),
    )


def rescheduling_horizon_days(plan: Any, today: date) -> int:
    """Horizon for rescheduling a missed task: the rest of the committed window."""
    window_end = rolling_state(plan).get("window_end")
    if window_end:
        remaining = (date.fromisoformat(window_end) - today).days + 1
        if remaining > 0:
            return remaining
    exam_date = getattr(plan, "exam_date", None)
    if exam_date is None:
        return WINDOW_DAYS
    return max(committed_window_days((exam_date - today).days), 1)


def schedule_limits(plan: Any) -> tuple[int, int]:
    """Session and daily minute caps, honouring any overload compression."""
    state = rolling_state(plan)
    constraints = plan.constraints
    session_minutes = int(state.get("session_minutes") or constraints["max_session_minutes"])
    daily_minutes = int(state.get("daily_minutes") or constraints.get("max_daily_minutes", 180))
    return min(session_minutes, daily_minutes), daily_minutes


def deferred_topics(plan: Any) -> set[str]:
    return set(rolling_state(plan).get("deferred_topics") or [])


# ---------------------------------------------------------------------------
# Database-backed roadmap
# ---------------------------------------------------------------------------


def plan_topic_inputs(
    session: Session,
    student_id: str,
    plan: StudyPlan,
) -> tuple[list[TopicInput], dict[str, str]]:
    preload_topics(session)
    states = {
        state.topic_id: state
        for state in session.scalars(
            select(LearnerTopicState).where(LearnerTopicState.student_id == student_id)
        ).all()
    }
    inputs: list[TopicInput] = []
    names: dict[str, str] = {}
    for item in plan.constraints.get("priorities", []):
        topic_id = item["topic_id"]
        topic = session.get(Topic, topic_id)
        if topic is None:
            continue
        prerequisites = list(getattr(topic, "prerequisites", None) or [])
        state = states.get(topic_id)
        inputs.append(
            {
                "topic_id": topic_id,
                "exam_weight": effective_exam_weight(topic.exam_weight),
                "mastery": float(state.mastery) if state is not None else NEUTRAL_PRIOR_MASTERY,
                "prerequisites": prerequisites,
                "prerequisite_mastery": {
                    prerequisite: float(states[prerequisite].mastery)
                    for prerequisite in prerequisites
                    if prerequisite in states
                },
            }
        )
        names[topic_id] = _topic_display_name(session, topic, topic_id)
    return inputs, names


def plan_daily_hours(session: Session, plan: StudyPlan) -> dict[int, float]:
    slots = session.scalars(select(AvailabilitySlot).where(AvailabilitySlot.plan_id == plan.id)).all()
    return daily_hours_by_weekday(list(slots), schedule_limits(plan)[1])


def build_and_store_roadmap(
    session: Session,
    student_id: str,
    plan: StudyPlan,
    *,
    now: datetime | None = None,
) -> list[RoadmapWeekData]:
    """Regenerate and persist the roadmap rows for ``plan``."""
    today = (now or datetime.now(UTC)).astimezone(UTC).date()
    inputs, names = plan_topic_inputs(session, student_id, plan)
    state = rolling_state(plan)
    window_end = date.fromisoformat(state["window_end"]) if state.get("window_end") else None
    rows = (
        forecast_weeks(
            inputs,
            # Sessions use about 85% of the free time (the rest is catch-up time), so the
            # roadmap's weekly hours match what the committed window really schedules.
            daily_hours={
                weekday: hours * (1 - CATCH_UP_BUFFER)
                for weekday, hours in plan_daily_hours(session, plan).items()
            },
            today=today,
            exam_date=plan.exam_date,
            window_end=window_end,
            deferred=deferred_topics(plan),
            topic_names=names,
            compression_note=state.get("compression_note"),
        )
        if inputs
        else []
    )
    for old in session.scalars(
        select(RoadmapWeek).where(
            RoadmapWeek.plan_id == plan.id,
            RoadmapWeek.student_id == student_id,
        )
    ).all():
        session.delete(old)
    for row in rows:
        session.add(
            RoadmapWeek(
                plan_id=plan.id,
                student_id=student_id,
                week_start=row.week_start,
                label=row.label,
                topics=row.topics,
                total_hours=row.total_hours,
                weeks_to_exam=row.weeks_to_exam,
                compressed=row.compressed,
                compression_note=row.compression_note,
            )
        )
    return rows


def get_roadmap(
    session: Session,
    student_id: str,
    plan_id: UUID,
    *,
    now: datetime | None = None,
    checkpoint_due: tuple[bool, str | None] = (False, None),
) -> dict[str, Any]:
    """Return the stored roadmap plus rolling-window metadata for the API."""
    plan = session.get(StudyPlan, plan_id)
    if plan is None or plan.student_id != student_id:
        raise NotFound("Study plan not found.")
    today = (now or datetime.now(UTC)).astimezone(UTC).date()
    stored = session.scalars(
        select(RoadmapWeek)
        .where(RoadmapWeek.plan_id == plan.id, RoadmapWeek.student_id == student_id)
        .order_by(RoadmapWeek.week_start)
    ).all()
    final_start = plan.exam_date - timedelta(days=FINAL_WEEK_DAYS)
    weeks = [
        {
            "week_start": row.week_start,
            "week_end": row.week_start + timedelta(days=6),
            "label": row.label,
            "phase": (
                "final_revision"
                if min(row.week_start + timedelta(days=6), plan.exam_date - timedelta(days=1)) >= final_start
                else "learning"
            ),
            "topics": row.topics,
            "total_hours": row.total_hours,
            "weeks_to_exam": row.weeks_to_exam,
            "compressed": row.compressed,
            "compression_note": row.compression_note,
        }
        for row in stored
        if row.week_start + timedelta(days=6) >= today
    ]
    state = rolling_state(plan)
    days_to_exam = max((plan.exam_date - today).days, 0)
    window_end = date.fromisoformat(state["window_end"]) if state.get("window_end") else None
    _, names = plan_topic_inputs(session, student_id, plan) if state.get("deferred_topics") else ([], {})
    return {
        "plan_id": plan.id,
        "exam_date": plan.exam_date,
        "days_to_exam": days_to_exam,
        "window_days": int(state.get("window_days") or committed_window_days(days_to_exam)),
        "window_start": date.fromisoformat(state["window_start"]) if state.get("window_start") else None,
        "window_end": window_end,
        "next_checkpoint": (
            window_end + timedelta(days=1)
            if window_end is not None and window_end < plan.exam_date - timedelta(days=1)
            else None
        ),
        "final_week_start": final_start,
        "final_week": is_final_week(days_to_exam),
        "checkpoint_due": checkpoint_due[0],
        "checkpoint_reason": checkpoint_due[1],
        "deferred_topics": [
            {"topic_id": topic_id, "topic_name": names.get(topic_id, topic_id)}
            for topic_id in state.get("deferred_topics") or []
        ],
        "compression_note": state.get("compression_note"),
        "target_choice": state.get("pending_target_choice"),
        "weeks": weeks,
    }


# ---------------------------------------------------------------------------
# Overload handling
# ---------------------------------------------------------------------------


@dataclass
class OverloadOutcome:
    compressed: bool = False
    dropped_topics: list[str] = field(default_factory=list)
    restored_topics: list[str] = field(default_factory=list)
    explanation: str | None = None
    target_choice: dict[str, Any] | None = None


def apply_overload_rule(
    session: Session,
    student_id: str,
    plan: StudyPlan,
    adherence: float | None,
    *,
    now: datetime,
) -> OverloadOutcome:
    """Compress the plan when weekly adherence is below ``ADHERENCE_FLOOR``.

    The lowest-gain topics are deferred first, sessions are shortened and the
    daily load is reduced. The target grade is never changed here: when the
    lighter plan no longer reaches the target, the student is offered a choice
    instead. If adherence recovers, deferred topics are restored.
    """
    state = rolling_state(plan)
    previously_deferred = list(state.get("deferred_topics") or [])
    if adherence is None or (adherence >= ADHERENCE_FLOOR and not previously_deferred):
        return OverloadOutcome()
    inputs, names = plan_topic_inputs(session, student_id, plan)
    if adherence >= ADHERENCE_FLOOR:
        set_rolling_state(
            plan,
            deferred_topics=[],
            compression_note=None,
            session_minutes=None,
            daily_minutes=None,
            pending_target_choice=None,
        )
        restored = [names.get(topic_id, topic_id) for topic_id in previously_deferred]
        explanation = (
            f"Great consistency: you completed {round(adherence * 100)}% of your planned time, "
            f"so these topics are back in your plan: {', '.join(restored)}."
        )
        session.add(
            ReplanLog(
                student_id=student_id,
                plan_id=plan.id,
                reason="Deferred topics restored after adherence recovered.",
                changes=[{"adherence": adherence, "restored_topics": previously_deferred}],
            )
        )
        return OverloadOutcome(restored_topics=previously_deferred, explanation=explanation)
    if not inputs:
        return OverloadOutcome()

    constraints = plan.constraints
    slots = session.scalars(select(AvailabilitySlot).where(AvailabilitySlot.plan_id == plan.id)).all()
    full_daily = int(constraints.get("max_daily_minutes", 180))
    weekly_hours = sum(daily_hours_by_weekday(list(slots), full_daily).values())
    load = compressed_load(adherence)
    gain_by_topic = {item["topic_id"]: expected_gain_per_hour(item) for item in inputs}
    compression = compress_allocation(
        allocate_hours(inputs, weekly_hours),
        gain_by_topic,
        weekly_hours * load,
    )
    daily_minutes = max(MIN_COMPRESSED_SESSION_MINUTES, round(full_daily * load))
    session_minutes = min(
        daily_minutes,
        max(
            MIN_COMPRESSED_SESSION_MINUTES,
            round(int(constraints["max_session_minutes"]) * COMPRESSED_SESSION_FACTOR),
        ),
    )
    dropped = sorted(set(previously_deferred) | set(compression.dropped))
    kept_names = [names.get(topic_id, topic_id) for topic_id in sorted(
        compression.kept, key=lambda topic_id: -gain_by_topic.get(topic_id, 0.0)
    )]
    dropped_names = [names.get(topic_id, topic_id) for topic_id in dropped]
    explanation = (
        f"Last week you completed {round(adherence * 100)}% of your planned study time, so we made "
        f"your plan lighter: sessions are now up to {session_minutes} minutes and about "
        f"{daily_minutes} minutes a day. "
        + (
            f"These lower-impact topics are paused for now: {', '.join(dropped_names)}. "
            if dropped_names
            else ""
        )
        + (f"Your highest-impact topics stay: {', '.join(kept_names[:3])}. " if kept_names else "")
        + f"Your target grade ({plan.target_grade}) has not changed."
    )
    target_choice = _target_choice(
        plan,
        [item for item in inputs if item["topic_id"] not in dropped] or inputs,
        inputs,
        compressed_hours=weekly_hours * load,
        full_hours=weekly_hours,
        today=now.date(),
    )
    set_rolling_state(
        plan,
        deferred_topics=dropped,
        compression_note=explanation,
        session_minutes=session_minutes,
        daily_minutes=daily_minutes,
        pending_target_choice=target_choice,
    )
    session.add(
        ReplanLog(
            student_id=student_id,
            plan_id=plan.id,
            reason="Plan compressed because weekly adherence was below the floor.",
            changes=[
                {
                    "adherence": adherence,
                    "adherence_floor": ADHERENCE_FLOOR,
                    "dropped_topics": dropped,
                    "session_minutes": session_minutes,
                    "daily_minutes": daily_minutes,
                    "target_grade": plan.target_grade,
                    "explanation": explanation,
                }
            ],
        )
    )
    return OverloadOutcome(
        compressed=True,
        dropped_topics=dropped,
        explanation=explanation,
        target_choice=target_choice,
    )


def _target_choice(
    plan: StudyPlan,
    kept_inputs: list[TopicInput],
    all_inputs: list[TopicInput],
    *,
    compressed_hours: float,
    full_hours: float,
    today: date,
) -> dict[str, Any] | None:
    """Offer "keep target, more hours" vs "adjust goal, current pace"."""
    days_remaining = max((plan.exam_date - today).days, 0)
    current = _weighted_mastery(all_inputs)
    lighter = build_achievability_report(
        current=current,
        target_grade=plan.target_grade,
        topics=kept_inputs,
        days_remaining=days_remaining,
        hours_available=compressed_hours,
    )
    full = build_achievability_report(
        current=current,
        target_grade=plan.target_grade,
        topics=all_inputs,
        days_remaining=days_remaining,
        hours_available=full_hours,
    )
    pace_grade = grade_for(lighter.projected_range.expected)
    if pace_grade == plan.target_grade.upper():
        return None
    hours_per_day = round(full.hours_needed / 7, 1)
    # Never suggest an impossible daily load (e.g. "14 hours a day" for a C
    # student aiming for an A in 10 days); encourage effort instead.
    keep_label = (
        f"Keep target {plan.target_grade}: bring back all topics and aim for about "
        f"{hours_per_day} hours a day."
        if hours_per_day <= REALISTIC_MAX_HOURS_PER_DAY
        else f"Keep target {plan.target_grade}: bring back all topics and give it your best every day."
    )
    return {
        "target_grade": plan.target_grade,
        "keep_target": {
            "grade": plan.target_grade,
            "hours_per_day": min(hours_per_day, REALISTIC_MAX_HOURS_PER_DAY),
            "label": keep_label,
        },
        "adjust_goal": {
            "grade": pace_grade,
            "hours_per_day": round(compressed_hours / 7, 1),
            "label": f"Adjust goal to {pace_grade}: keep the lighter plan at your current pace.",
        },
    }


def _weighted_mastery(inputs: list[TopicInput]) -> float:
    total_weight = sum(float(item.get("exam_weight", 0.0)) for item in inputs)
    if total_weight <= 0:
        return sum(float(item.get("mastery", 0.0)) for item in inputs) / len(inputs) if inputs else 0.0
    weighted = sum(float(item.get("exam_weight", 0.0)) * float(item.get("mastery", 0.0)) for item in inputs)
    return weighted / total_weight


def _projected_input(topic: TopicInput, mastery: dict[str, float]) -> TopicInput:
    known = topic.get("prerequisite_mastery", {})
    return {
        **topic,
        "mastery": mastery[topic["topic_id"]],
        "prerequisite_mastery": {
            prerequisite: mastery.get(prerequisite, float(known.get(prerequisite, 0.0)))
            for prerequisite in topic.get("prerequisites", [])
        },
    }


def _topic_display_name(session: Session, topic: Any, topic_id: str) -> str:
    name = getattr(topic, "name", None) or topic_id
    parent_id = getattr(topic, "parent_id", None)
    parent = session.get(Topic, parent_id) if parent_id else None
    if parent is not None:
        return f"{getattr(parent, 'name', parent_id)}, {name}"
    return name


def _monday_of(day: date) -> date:
    return day - timedelta(days=day.weekday())

