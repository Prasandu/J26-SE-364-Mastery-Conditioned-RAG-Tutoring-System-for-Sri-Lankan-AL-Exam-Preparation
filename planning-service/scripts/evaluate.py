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

from app.services.priority import compute_priority
from app.services.scheduler import RankedTopic, ScheduleResult, TimeWindow, schedule_tasks

STUDENT_COUNT = 50
STUDY_BUDGET_MINUTES = 2_400
EXAM_HORIZON_DAYS = 56
HIGH_PRIORITY_FRACTION = 0.25
STRATEGIES = ("Adaptive planning", "Static timetable", "Lowest-mark heuristic")


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


def read_teacher_ranking(path: Path) -> list[Topic]:
    """Read global teacher priority ranks from topic_id,rank[,exam_weight] CSV."""
    try:
        with path.open(encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            if not reader.fieldnames or not {"topic_id", "rank"}.issubset(reader.fieldnames):
                raise ValueError("CSV headers must include topic_id and rank.")
            topics: list[Topic] = []
            for line_number, row in enumerate(reader, start=2):
                topic_id = (row.get("topic_id") or "").strip()
                if not topic_id:
                    raise ValueError(f"line {line_number}: topic_id cannot be empty.")
                try:
                    rank = float(row["rank"])
                    exam_weight = float(row.get("exam_weight") or 0.7)
                except (TypeError, ValueError) as exc:
                    raise ValueError(f"line {line_number}: rank and exam_weight must be numbers.") from exc
                if not (isfinite(rank) and rank > 0 and isfinite(exam_weight) and 0 <= exam_weight <= 1):
                    raise ValueError(
                        f"line {line_number}: rank must be positive and exam_weight must be 0..1."
                    )
                topics.append(Topic(topic_id, rank, exam_weight))
    except OSError as exc:
        raise ValueError(f"Cannot read teacher ranking CSV {path}: {exc}") from exc

    if len(topics) < 2:
        raise ValueError("Teacher ranking CSV must contain at least two topics.")
    ids = [topic.topic_id for topic in topics]
    if len(set(ids)) != len(ids):
        raise ValueError("Teacher ranking CSV contains duplicate topic_id values.")
    if len({topic.teacher_rank for topic in topics}) < 2:
        raise ValueError("Teacher ranking must contain at least two distinct ranks.")
    return topics


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
        results = evaluate(read_teacher_ranking(arguments.teacher_ranking), seed=arguments.seed)
    except ValueError as exc:
        print(f"Evaluation input error: {exc}", file=sys.stderr)
        return 2
    report = markdown_table(results)
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
