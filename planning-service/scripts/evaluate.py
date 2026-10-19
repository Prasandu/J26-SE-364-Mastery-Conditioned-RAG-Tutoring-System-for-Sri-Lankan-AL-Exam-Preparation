"""Compare planning strategies on a deterministic synthetic student cohort."""

from __future__ import annotations

import argparse
import csv
import random
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from math import ceil, isfinite
from pathlib import Path
from statistics import mean, stdev

from app.services.achievability import TopicInput, allocate_hours, expected_gain_per_hour
from app.services.priority import compute_priority
from app.services.roadmap import (
    committed_window_days,
    compress_allocation,
    compressed_load,
    forecast_weeks,
    project_mastery,
)
from app.services.scheduler import (
    RankedTopic,
    ScheduledTask,
    ScheduleResult,
    TimeWindow,
    schedule_tasks,
)
from app.services.weights import (
    ADHERENCE_FLOOR,
    COMPRESSED_SESSION_FACTOR,
    MIN_COMPRESSED_SESSION_MINUTES,
)

STUDENT_COUNT = 50
STUDY_BUDGET_MINUTES = 2_400
EXAM_HORIZON_DAYS = 56
HIGH_PRIORITY_FRACTION = 0.25
STRATEGIES = ("Adaptive planning", "Static timetable", "Lowest-mark heuristic")

ROLLING_STRATEGIES = (
    "Fixed full-period plan",
    "Rolling re-planning (14/7-day window)",
    "Rolling re-planning (7-day window)",
    "Rolling re-planning, no compression (14/7-day window)",
)
ROLLING_HORIZON_DAYS = 42
ROLLING_SHIFT_DAY = 21
ROLLING_SESSION_MINUTES = 60
ROLLING_DAILY_CAP_MINUTES = 120
ROLLING_OBSERVATION_NOISE = 0.05
ROLLING_MISS_PROBABILITY = 0.05


@dataclass(frozen=True)
class Topic:
    topic_id: str
    teacher_rank: float
    exam_weight: float


@dataclass(frozen=True)
class Student:
    student_id: str
    mastery: dict[str, float]
    days_since_revision: dict[str, int]


@dataclass(frozen=True)
class Metrics:
    feasibility_violations_per_student: float
    adherence_percent: float
    overdue_high_priority_tasks_per_student: float
    prediction_mae: float
    prediction_rmse: float
    priority_agreement: float


@dataclass(frozen=True)
class RollingMetrics:
    """Mean outcomes per strategy; ``*_ci95`` are 95% confidence half-widths."""

    adherence_percent: float
    adherence_ci95: float
    mastery_gain: float
    mastery_gain_ci95: float
    gain_vs_fixed: float
    gain_vs_fixed_ci95: float
    overdue_high_priority_per_student: float
    overdue_ci95: float
    feasibility_violations_per_student: float
    replans_per_student: float


@dataclass(frozen=True)
class ChangingStudent:
    """A simulated student whose true ability and capacity change mid-period."""

    student_id: str
    initial_mastery: dict[str, float]
    shift: dict[str, float]
    capacity_before: int
    capacity_after: int


@dataclass(frozen=True)
class _StudentOutcome:
    adherence_percent: float
    mastery_gain: float
    overdue_high_priority: int
    feasibility_violations: int
    replans: int


def read_teacher_ranking(path: Path) -> list[Topic]:
    """Read global or per-student topic ranks and aggregate teacher priorities."""
    try:
        with path.open(encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            if not reader.fieldnames or not {"topic_id", "rank"}.issubset(reader.fieldnames):
                raise ValueError("CSV headers must include topic_id and rank.")
            student_column = "student_id" in reader.fieldnames
            rankings: dict[str, dict[str, Topic]] = {}
            for line_number, row in enumerate(reader, start=2):
                topic_id = (row.get("topic_id") or "").strip()
                if not topic_id:
                    raise ValueError(f"line {line_number}: topic_id cannot be empty.")
                student_id = (row.get("student_id") or "").strip() if student_column else "global"
                if student_column and not student_id:
                    raise ValueError(f"line {line_number}: student_id cannot be empty.")
                try:
                    rank = float(row["rank"])
                    exam_weight = float(row.get("exam_weight") or 0.7)
                except (TypeError, ValueError) as exc:
                    raise ValueError(f"line {line_number}: rank and exam_weight must be numbers.") from exc
                if not (isfinite(rank) and rank > 0 and isfinite(exam_weight) and 0 <= exam_weight <= 1):
                    raise ValueError(
                        f"line {line_number}: rank must be positive and exam_weight must be 0..1."
                    )
                group = rankings.setdefault(student_id, {})
                if topic_id in group:
                    raise ValueError(
                        f"CSV contains duplicate topic_id {topic_id!r} for student {student_id!r}."
                    )
                group[topic_id] = Topic(topic_id, rank, exam_weight)
    except OSError as exc:
        raise ValueError(f"Cannot read teacher ranking CSV {path}: {exc}") from exc

    if not rankings:
        raise ValueError("Teacher ranking CSV must contain at least two topics.")
    for student_id, topics in rankings.items():
        if len(topics) < 2:
            raise ValueError(f"Teacher ranking for {student_id!r} must contain at least two topics.")
        if len({topic.teacher_rank for topic in topics.values()}) < 2:
            raise ValueError(f"Teacher ranking for {student_id!r} must contain at least two distinct ranks.")

    topic_ranks: dict[str, list[Topic]] = {}
    for topics in rankings.values():
        for topic in topics.values():
            topic_ranks.setdefault(topic.topic_id, []).append(topic)
    return [
        Topic(
            topic_id,
            sum(item.teacher_rank for item in values) / len(values),
            sum(item.exam_weight for item in values) / len(values),
        )
        for topic_id, values in sorted(topic_ranks.items())
    ]


def evaluate(topics: list[Topic], *, seed: int = 364) -> dict[str, Metrics]:
    """Simulate 50 students and return mean outcome metrics for each strategy."""
    if len(topics) < 2:
        raise ValueError("At least two topics are required.")
    if len({topic.topic_id for topic in topics}) != len(topics):
        raise ValueError("Topic IDs must be unique.")

    rng = random.Random(seed)
    students = [
        Student(
            student_id=f"student-{index + 1:03d}",
            mastery={topic.topic_id: rng.uniform(0.15, 0.85) for topic in topics},
            days_since_revision={topic.topic_id: rng.randint(0, 70) for topic in topics},
        )
        for index in range(STUDENT_COUNT)
    ]
    accumulators = {strategy: _Accumulator() for strategy in STRATEGIES}
    now = datetime(2026, 1, 5, 0, 0, tzinfo=UTC)
    exam_deadline = now + timedelta(days=EXAM_HORIZON_DAYS)
    windows = _availability(now.date(), EXAM_HORIZON_DAYS)

    for student in students:
        scores = _topic_scores(topics, student, exam_deadline.date(), now)
        for strategy in STRATEGIES:
            ranked_topics = _make_ranked_topics(topics, scores[strategy])
            schedule = schedule_tasks(
                priorities=ranked_topics,
                availability=windows,
                commitments=(),
                exam_deadline=exam_deadline,
                max_session_minutes=60,
                daily_cap_minutes=120,
                now=now,
            )
            completed_minutes, topic_minutes, overdue_count = _simulate_outcomes(
                schedule,
                scores[strategy],
                student,
                seed=seed,
                strategy=strategy,
            )
            violations = _count_feasibility_violations(schedule, windows, exam_deadline)
            agreement = _spearman(
                {topic.topic_id: topic.teacher_rank for topic in topics},
                scores[strategy],
            )
            accumulator = accumulators[strategy]
            accumulator.students += 1
            accumulator.feasibility_violations += violations
            accumulator.planned_minutes += sum(task.duration_min for task in schedule.tasks)
            accumulator.completed_minutes += completed_minutes
            accumulator.overdue_high_priority_tasks += overdue_count
            accumulator.priority_agreement += agreement
            _score_predictions(
                accumulator,
                topics,
                student,
                topic_minutes,
                seed=seed,
            )

    return {strategy: accumulator.finish() for strategy, accumulator in accumulators.items()}


@dataclass
class _Accumulator:
    students: int = 0
    feasibility_violations: int = 0
    planned_minutes: int = 0
    completed_minutes: int = 0
    overdue_high_priority_tasks: int = 0
    priority_agreement: float = 0.0
    absolute_errors: list[float] | None = None
    squared_errors: list[float] | None = None

    def __post_init__(self) -> None:
        self.absolute_errors = []
        self.squared_errors = []

    def finish(self) -> Metrics:
        assert self.absolute_errors is not None and self.squared_errors is not None
        sample_count = len(self.absolute_errors)
        return Metrics(
            feasibility_violations_per_student=self.feasibility_violations / self.students,
            adherence_percent=(
                100 * self.completed_minutes / self.planned_minutes if self.planned_minutes else 0
            ),
            overdue_high_priority_tasks_per_student=(self.overdue_high_priority_tasks / self.students),
            prediction_mae=sum(self.absolute_errors) / sample_count,
            prediction_rmse=(sum(self.squared_errors) / sample_count) ** 0.5,
            priority_agreement=self.priority_agreement / self.students,
        )


def _topic_scores(
    topics: list[Topic],
    student: Student,
    exam_date: date,
    now: datetime,
) -> dict[str, dict[str, float]]:
    adaptive: dict[str, float] = {}
    lowest_mark: dict[str, float] = {}
    for topic in topics:
        mastery = student.mastery[topic.topic_id]
        adaptive[topic.topic_id] = compute_priority(
            weakness=1 - mastery,
            exam_importance=topic.exam_weight,
            days_until_exam=(exam_date - now.date()).days,
            days_since_revision=student.days_since_revision[topic.topic_id],
            improvement_potential=1 - mastery,
        ).score
        lowest_mark[topic.topic_id] = 1 - mastery
    return {
        "Adaptive planning": adaptive,
        "Static timetable": {topic.topic_id: 1.0 for topic in topics},
        "Lowest-mark heuristic": lowest_mark,
    }


def _make_ranked_topics(
    topics: list[Topic],
    priorities: dict[str, float],
) -> list[RankedTopic]:
    ordered = sorted(topics, key=lambda topic: (-priorities[topic.topic_id], topic.topic_id))
    allocated_minutes = _allocate_minutes(ordered, priorities)
    return [
        RankedTopic(
            topic_id=topic.topic_id,
            activity="guided_practice",
            priority=priorities[topic.topic_id],
            duration_minutes=allocated_minutes[topic],
            reason="Priority-weighted study allocation.",
        )
        for topic in ordered
    ]


def _allocate_minutes(
    topics: list[Topic],
    priorities: dict[str, float],
) -> dict[Topic, int]:
    """Give every topic a small baseline, then allocate remaining time by priority."""
    baseline = 15
    distributable = STUDY_BUDGET_MINUTES - baseline * len(topics)
    if distributable < 0:
        raise ValueError(f"Too many topics; maximum supported is {STUDY_BUDGET_MINUTES // baseline}.")
    weight_total = sum(priorities[topic.topic_id] for topic in topics)
    weights = (
        {topic.topic_id: 1 / len(topics) for topic in topics}
        if weight_total <= 0
        else {topic.topic_id: priorities[topic.topic_id] / weight_total for topic in topics}
    )
    exact = {topic.topic_id: distributable * weights[topic.topic_id] for topic in topics}
    rounded_down = {topic.topic_id: int(exact[topic.topic_id]) for topic in topics}
    remainder = distributable - sum(rounded_down.values())
    remainder_order = sorted(
        topics,
        key=lambda topic: (-(exact[topic.topic_id] - rounded_down[topic.topic_id]), topic.topic_id),
    )
    for topic in remainder_order[:remainder]:
        rounded_down[topic.topic_id] += 1
    return {topic: baseline + rounded_down[topic.topic_id] for topic in topics}


def _availability(start_date: date, days: int) -> list[TimeWindow]:
    windows: list[TimeWindow] = []
    for offset in range(days):
        current_date = start_date + timedelta(days=offset)
        start_time, end_time = (time(9), time(12)) if current_date.weekday() >= 5 else (time(18), time(21))
        windows.append(
            TimeWindow(
                datetime.combine(current_date, start_time, UTC),
                datetime.combine(current_date, end_time, UTC),
            )
        )
    return windows


def _simulate_outcomes(
    schedule: ScheduleResult,
    priorities: dict[str, float],
    student: Student,
    *,
    seed: int,
    strategy: str,
) -> tuple[int, dict[str, tuple[int, int]], int]:
    completed_minutes = 0
    by_topic: dict[str, list[int]] = {topic_id: [0, 0] for topic_id in priorities}
    high_priority_topics = _top_quartile_topics(priorities)
    overdue = 0
    for task in schedule.tasks:
        completion_probability = max(
            0.55,
            0.92 - 0.20 * (1 - student.mastery[task.topic_id]) - (0.08 if task.start_at.hour >= 20 else 0),
        )
        draw = random.Random(
            f"{seed}:{student.student_id}:{strategy}:{task.topic_id}:{task.start_at.isoformat()}"
        ).random()
        if draw < completion_probability:
            completed_minutes += task.duration_min
            by_topic[task.topic_id][0] += task.duration_min
        by_topic[task.topic_id][1] += task.duration_min
        if task.topic_id in high_priority_topics:
            if draw >= completion_probability:
                overdue += 1
    return (
        completed_minutes,
        {topic_id: (minutes[0], minutes[1]) for topic_id, minutes in by_topic.items()},
        overdue,
    )


def _score_predictions(
    accumulator: _Accumulator,
    topics: list[Topic],
    student: Student,
    topic_minutes: dict[str, tuple[int, int]],
    *,
    seed: int,
) -> None:
    assert accumulator.absolute_errors is not None and accumulator.squared_errors is not None
    for topic in topics:
        current = student.mastery[topic.topic_id]
        completed, planned = topic_minutes[topic.topic_id]
        expected_completed = planned * 0.8
        forecast_gain = 0.22 * expected_completed / (expected_completed + 120)
        forecast = min(1.0, current + forecast_gain)
        outcome_rng = random.Random(f"outcome:{seed}:{student.student_id}:{topic.topic_id}")
        outcome_noise = outcome_rng.gauss(0, 0.04)
        actual_gain = 0.22 * completed / (completed + 120) if completed else 0.0
        actual = min(1.0, max(0.0, current + actual_gain + outcome_noise))
        error = forecast - actual
        accumulator.absolute_errors.append(abs(error))
        accumulator.squared_errors.append(error * error)


def _count_feasibility_violations(
    schedule: ScheduleResult,
    windows: list[TimeWindow],
    deadline: datetime,
) -> int:
    violations = int(schedule.infeasible)
    scheduled = sorted(schedule.tasks, key=lambda task: task.start_at)
    daily_minutes: dict[date, int] = {}
    for index, task in enumerate(scheduled):
        if task.duration_min > 60 or task.start_at + timedelta(minutes=task.duration_min) > deadline:
            violations += 1
        matching_window = next(
            (
                window
                for window in windows
                if window.start_at <= task.start_at
                and task.start_at + timedelta(minutes=task.duration_min) <= window.end_at
            ),
            None,
        )
        if matching_window is None:
            violations += 1
        if (
            index
            and scheduled[index - 1].start_at + timedelta(minutes=scheduled[index - 1].duration_min)
            > task.start_at
        ):
            violations += 1
        daily_minutes[task.start_at.date()] = daily_minutes.get(task.start_at.date(), 0) + task.duration_min
    violations += sum(minutes > 120 for minutes in daily_minutes.values())
    return violations


def _top_quartile_topics(priorities: dict[str, float]) -> set[str]:
    count = max(1, ceil(len(priorities) * HIGH_PRIORITY_FRACTION))
    return {
        topic_id for topic_id, _ in sorted(priorities.items(), key=lambda item: (-item[1], item[0]))[:count]
    }


def _spearman(teacher_ranks: dict[str, float], priorities: dict[str, float]) -> float:
    topic_ids = sorted(teacher_ranks)
    teacher_order = _rankdata([teacher_ranks[topic_id] for topic_id in topic_ids])
    policy_order = _rankdata([-priorities[topic_id] for topic_id in topic_ids])
    return _pearson(teacher_order, policy_order)


def _rankdata(values: list[float]) -> list[float]:
    ordered = sorted(enumerate(values), key=lambda item: item[1])
    ranks = [0.0] * len(values)
    start = 0
    while start < len(ordered):
        end = start + 1
        while end < len(ordered) and ordered[end][1] == ordered[start][1]:
            end += 1
        average_rank = (start + 1 + end) / 2
        for index in range(start, end):
            ranks[ordered[index][0]] = average_rank
        start = end
    return ranks


def _pearson(left: list[float], right: list[float]) -> float:
    mean_left = sum(left) / len(left)
    mean_right = sum(right) / len(right)
    numerator = sum((a - mean_left) * (b - mean_right) for a, b in zip(left, right, strict=True))
    denominator_left = sum((value - mean_left) ** 2 for value in left) ** 0.5
    denominator_right = sum((value - mean_right) ** 2 for value in right) ** 0.5
    if denominator_left == 0 or denominator_right == 0:
        return 0.0
    return numerator / (denominator_left * denominator_right)


def evaluate_rolling(
    topics: list[Topic],
    *,
    seed: int = 364,
    student_count: int = STUDENT_COUNT,
) -> dict[str, RollingMetrics]:
    """Compare rolling re-planning with a fixed full-period plan.

    Every simulated student has a true mastery that shifts on day 21 (decline
    or outside help) and a daily study capacity that changes at the same time.
    The fixed plan is the day-1 roadmap executed unchanged; the rolling plans
    observe noisy marks at each checkpoint, compress when adherence drops below
    the floor and rebuild the roadmap with the planning service's own rules.
    """
    if len(topics) < 2:
        raise ValueError("At least two topics are required.")
    rng = random.Random(f"rolling:{seed}")
    students = []
    for index in range(student_count):
        initial = {topic.topic_id: rng.uniform(0.15, 0.85) for topic in topics}
        shift = {
            topic.topic_id: rng.choice((-1, 1)) * rng.uniform(0.15, 0.3) if rng.random() < 0.4 else 0.0
            for topic in topics
        }
        capacity = rng.randint(50, 140)
        students.append(
            ChangingStudent(
                student_id=f"student-{index + 1:03d}",
                initial_mastery=initial,
                shift=shift,
                capacity_before=capacity,
                capacity_after=round(capacity * rng.uniform(0.5, 1.2)),
            )
        )
    start = datetime(2026, 1, 5, tzinfo=UTC)
    windows = _availability(start.date(), ROLLING_HORIZON_DAYS)
    outcomes: dict[str, list[_StudentOutcome]] = {strategy: [] for strategy in ROLLING_STRATEGIES}
    for student in students:
        for strategy in ROLLING_STRATEGIES:
            outcomes[strategy].append(
                _simulate_changing_student(topics, student, strategy, start, windows, seed=seed)
            )
    baseline = outcomes[ROLLING_STRATEGIES[0]]
    return {strategy: _summarise_rolling(values, baseline) for strategy, values in outcomes.items()}


def _simulate_changing_student(
    topics: list[Topic],
    student: ChangingStudent,
    strategy: str,
    start: datetime,
    windows: list[TimeWindow],
    *,
    seed: int,
) -> _StudentOutcome:
    topic_by_id = {topic.topic_id: topic for topic in topics}
    true_mastery = dict(student.initial_mastery)
    exam = start + timedelta(days=ROLLING_HORIZON_DAYS)
    rolling = strategy != ROLLING_STRATEGIES[0]
    compression_enabled = "no compression" not in strategy
    tasks_by_day: dict[int, list[ScheduledTask]] = {}
    all_tasks: list[ScheduledTask] = []
    planned_by_day: dict[int, int] = {}
    completed_by_day: dict[int, int] = {}
    deferred: set[str] = set()
    session_minutes, daily_cap = ROLLING_SESSION_MINUTES, ROLLING_DAILY_CAP_MINUTES
    planned_until = -1
    replans = overdue = 0
    week_top: set[str] = set()
    week_studied: dict[str, int] = {}

    for day in range(ROLLING_HORIZON_DAYS):
        if day == ROLLING_SHIFT_DAY:
            for topic_id, change in student.shift.items():
                true_mastery[topic_id] = min(1.0, max(0.0, true_mastery[topic_id] + change))
        if day > planned_until and (rolling or day == 0):
            days_left = ROLLING_HORIZON_DAYS - day
            if not rolling:
                window = days_left
            elif "7-day window" in strategy and "14/7" not in strategy:
                window = min(7, days_left)
            else:
                window = committed_window_days(days_left)
            observed = {
                topic_id: _observed_mastery(value, f"{seed}:{student.student_id}:{day}:{topic_id}")
                for topic_id, value in true_mastery.items()
            }
            if rolling and compression_enabled and day >= 7:
                planned = sum(planned_by_day.get(index, 0) for index in range(day - 7, day))
                completed = sum(completed_by_day.get(index, 0) for index in range(day - 7, day))
                adherence = completed / planned if planned else None
                if adherence is not None and adherence < ADHERENCE_FLOOR:
                    deferred, session_minutes, daily_cap = _simulated_compression(
                        topics,
                        observed,
                        adherence,
                    )
                elif adherence is not None:
                    deferred = set()
                    session_minutes, daily_cap = ROLLING_SESSION_MINUTES, ROLLING_DAILY_CAP_MINUTES
            new_tasks = _schedule_simulated_window(
                topics,
                observed,
                start=start,
                first_day=day,
                days=window,
                exam=exam,
                windows=windows,
                deferred=deferred,
                session_minutes=session_minutes,
                daily_cap=daily_cap,
            )
            for task in new_tasks:
                tasks_by_day.setdefault((task.start_at - start).days, []).append(task)
            all_tasks.extend(new_tasks)
            planned_until = day + window - 1
            replans += 1

        if day % 7 == 0:
            week_top = _top_quartile_topics(
                {
                    topic.topic_id: expected_gain_per_hour(
                        _simulated_input(topic, true_mastery[topic.topic_id])
                    )
                    for topic in topics
                }
            )
            week_studied = {}

        base_capacity = student.capacity_before if day < ROLLING_SHIFT_DAY else student.capacity_after
        capacity = base_capacity * random.Random(f"capacity:{seed}:{student.student_id}:{day}").uniform(
            0.75,
            1.25,
        )
        for task in sorted(tasks_by_day.get(day, []), key=lambda item: item.start_at):
            planned_by_day[day] = planned_by_day.get(day, 0) + task.duration_min
            miss_draw = random.Random(
                f"miss:{seed}:{student.student_id}:{strategy}:{task.start_at.isoformat()}"
            ).random()
            done = (
                0
                if miss_draw < ROLLING_MISS_PROBABILITY
                else int(min(task.duration_min, max(capacity, 0)))
            )
            capacity -= done
            completed_by_day[day] = completed_by_day.get(day, 0) + done
            if done:
                week_studied[task.topic_id] = week_studied.get(task.topic_id, 0) + done
                true_mastery[task.topic_id] = project_mastery(
                    _simulated_input(topic_by_id[task.topic_id], true_mastery[task.topic_id]),
                    done / 60,
                )
        if day % 7 == 6:
            overdue += sum(1 for topic_id in week_top if not week_studied.get(topic_id))

    planned_total = sum(planned_by_day.values())
    total_weight = sum(topic.exam_weight for topic in topics)
    gain = sum(
        topic.exam_weight * (true_mastery[topic.topic_id] - student.initial_mastery[topic.topic_id])
        for topic in topics
    ) / total_weight
    return _StudentOutcome(
        adherence_percent=100 * sum(completed_by_day.values()) / planned_total if planned_total else 0.0,
        mastery_gain=gain,
        overdue_high_priority=overdue,
        feasibility_violations=_count_feasibility_violations(
            ScheduleResult(tuple(all_tasks), False, 0, {}),
            windows,
            exam,
        ),
        replans=replans,
    )


def _observed_mastery(true_value: float, key: str) -> float:
    noise = random.Random(key).gauss(0, ROLLING_OBSERVATION_NOISE)
    return min(1.0, max(0.0, true_value + noise))


def _simulated_input(topic: Topic, mastery: float) -> TopicInput:
    return {
        "topic_id": topic.topic_id,
        "exam_weight": topic.exam_weight,
        "mastery": mastery,
        "prerequisites": [],
        "prerequisite_mastery": {},
    }


def _simulated_compression(
    topics: list[Topic],
    observed: dict[str, float],
    adherence: float,
) -> tuple[set[str], int, int]:
    """Mirror ``apply_overload_rule``: defer lowest-gain topics, shorten sessions."""
    inputs = [_simulated_input(topic, observed[topic.topic_id]) for topic in topics]
    weekly_hours = 7 * ROLLING_DAILY_CAP_MINUTES / 60
    load = compressed_load(adherence)
    compression = compress_allocation(
        allocate_hours(inputs, weekly_hours),
        {item["topic_id"]: expected_gain_per_hour(item) for item in inputs},
        weekly_hours * load,
    )
    daily_cap = max(MIN_COMPRESSED_SESSION_MINUTES, round(ROLLING_DAILY_CAP_MINUTES * load))
    session_minutes = min(
        daily_cap,
        max(MIN_COMPRESSED_SESSION_MINUTES, round(ROLLING_SESSION_MINUTES * COMPRESSED_SESSION_FACTOR)),
    )
    return set(compression.dropped), session_minutes, daily_cap


def _schedule_simulated_window(
    topics: list[Topic],
    observed: dict[str, float],
    *,
    start: datetime,
    first_day: int,
    days: int,
    exam: datetime,
    windows: list[TimeWindow],
    deferred: set[str],
    session_minutes: int,
    daily_cap: int,
) -> list[ScheduledTask]:
    """Turn the roadmap's weekly hours into detailed tasks for one window."""
    window_start = start + timedelta(days=first_day)
    window_end = window_start + timedelta(days=days)
    weeks = forecast_weeks(
        [_simulated_input(topic, observed[topic.topic_id]) for topic in topics],
        daily_hours={weekday: min(180, daily_cap) / 60 for weekday in range(7)},
        today=window_start.date(),
        exam_date=exam.date(),
        window_end=None,
        deferred=deferred,
    )
    tasks: list[ScheduledTask] = []
    for week in weeks:
        week_start = datetime.combine(week.week_start, time.min, UTC)
        if not window_start <= week_start < window_end or not week.topics:
            continue
        week_end = min(week_start + timedelta(days=7), window_end)
        top_hours = max(row["hours"] for row in week.topics)
        ranked = [
            RankedTopic(
                topic_id=row["topic_id"],
                activity="guided_practice",
                priority=row["hours"] / top_hours,
                duration_minutes=max(1, round(row["hours"] * 60)),
                reason="Roadmap weekly allocation.",
            )
            for row in week.topics
        ]
        result = schedule_tasks(
            priorities=ranked,
            availability=[item for item in windows if week_start <= item.start_at < week_end],
            commitments=(),
            exam_deadline=exam,
            max_session_minutes=session_minutes,
            daily_cap_minutes=daily_cap,
            now=week_start,
        )
        tasks.extend(result.tasks)
    return tasks


def _summarise_rolling(values: list[_StudentOutcome], baseline: list[_StudentOutcome]) -> RollingMetrics:
    """Summarise per-student outcomes; gain differences are paired with the fixed plan."""
    adherence = [item.adherence_percent for item in values]
    gains = [item.mastery_gain for item in values]
    paired = [item.mastery_gain - fixed.mastery_gain for item, fixed in zip(values, baseline, strict=True)]
    overdue = [float(item.overdue_high_priority) for item in values]
    return RollingMetrics(
        adherence_percent=mean(adherence),
        adherence_ci95=_ci95(adherence),
        mastery_gain=mean(gains),
        mastery_gain_ci95=_ci95(gains),
        gain_vs_fixed=mean(paired),
        gain_vs_fixed_ci95=_ci95(paired),
        overdue_high_priority_per_student=mean(overdue),
        overdue_ci95=_ci95(overdue),
        feasibility_violations_per_student=mean(item.feasibility_violations for item in values),
        replans_per_student=mean(item.replans for item in values),
    )


def _ci95(values: list[float]) -> float:
    return 1.96 * stdev(values) / len(values) ** 0.5 if len(values) > 1 else 0.0


def rolling_markdown_table(
    results: dict[str, RollingMetrics],
    *,
    student_count: int = STUDENT_COUNT,
) -> str:
    rows = [
        "| Strategy | Adherence | Mastery gain (exam-weighted) | Gain vs fixed (paired) | "
        "Overdue high-priority / student | Feasibility violations / student | Re-plans / student |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for strategy in ROLLING_STRATEGIES:
        metric = results[strategy]
        rows.append(
            f"| {strategy} | {metric.adherence_percent:.1f}% ± {metric.adherence_ci95:.1f} "
            f"| {metric.mastery_gain:+.3f} ± {metric.mastery_gain_ci95:.3f} "
            f"| {metric.gain_vs_fixed:+.3f} ± {metric.gain_vs_fixed_ci95:.3f} "
            f"| {metric.overdue_high_priority_per_student:.2f} ± {metric.overdue_ci95:.2f} "
            f"| {metric.feasibility_violations_per_student:.2f} "
            f"| {metric.replans_per_student:.1f} |"
        )
    rows.extend(
        [
            "",
            f"*Deterministic synthetic simulation of {student_count} students over "
            f"{ROLLING_HORIZON_DAYS} days; true mastery shifts and study capacity changes on day "
            f"{ROLLING_SHIFT_DAY}. ± values are 95% confidence intervals across students; "
            "gain vs fixed is the paired per-student difference from the fixed plan. "
            "This is not a real-student evaluation.*",
        ]
    )
    return "\n".join(rows)


def markdown_table(results: dict[str, Metrics]) -> str:
    rows = [
        "| Strategy | Feasibility violations / student | Adherence | "
        "Overdue high-priority tasks / student | Prediction MAE | "
        "Prediction RMSE | Priority agreement (Spearman) |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for strategy in STRATEGIES:
        metric = results[strategy]
        rows.append(
            f"| {strategy} | {metric.feasibility_violations_per_student:.2f} "
            f"| {metric.adherence_percent:.1f}% "
            f"| {metric.overdue_high_priority_tasks_per_student:.2f} "
            f"| {metric.prediction_mae:.3f} "
            f"| {metric.prediction_rmse:.3f} "
            f"| {metric.priority_agreement:.3f} |"
        )
    rows.extend(
        [
            "",
            f"*Deterministic synthetic simulation of {STUDENT_COUNT} students; "
            "prediction errors compare the expected-score proxy with simulated outcomes. "
            "This is not a real-student or trained-model evaluation.*",
        ]
    )
    return "\n".join(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--teacher-ranking",
        type=Path,
        required=True,
        help="CSV with topic_id,rank and optional exam_weight columns",
    )
    parser.add_argument("--seed", type=int, default=364)
    parser.add_argument("--output", type=Path, help="Optional Markdown output path")
    arguments = parser.parse_args()
    try:
        topics = read_teacher_ranking(arguments.teacher_ranking)
        results = evaluate(topics, seed=arguments.seed)
    except ValueError as exc:
        print(f"Evaluation input error: {exc}", file=sys.stderr)
        return 2
    report = (
        markdown_table(results)
        + "\n\n## Rolling re-planning vs fixed full-period plan\n\n"
        + rolling_markdown_table(evaluate_rolling(topics, seed=arguments.seed))
    )
    if arguments.output:
        try:
            arguments.output.write_text(report + "\n", encoding="utf-8")
        except OSError as exc:
            print(f"Cannot write Markdown report {arguments.output}: {exc}", file=sys.stderr)
            return 2
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
