from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from math import ceil


@dataclass(frozen=True)
class TimeWindow:
    start_at: datetime
    end_at: datetime


@dataclass(frozen=True)
class FixedCommitment:
    start_at: datetime
    end_at: datetime


@dataclass(frozen=True)
class RankedTopic:
    topic_id: str
    activity: str
    priority: float
    duration_minutes: int
    reason: str
    prerequisites: tuple[str, ...] = ()
    exam_weight: float = 0.0
    mastery: float = 0.0
    prerequisite_mastery: dict[str, float] | None = None


@dataclass(frozen=True)
class ScheduledTask:
    topic_id: str
    activity: str
    start_at: datetime
    duration_min: int
    reason: str
    priority: float

    @property
    def end_at(self) -> datetime:
        return self.start_at + timedelta(minutes=self.duration_min)


@dataclass(frozen=True)
class ScheduleResult:
    tasks: tuple[ScheduledTask, ...]
    infeasible: bool
    shortfall_minutes: int
    unscheduled_minutes: dict[str, int]


class GreedyScheduler:
    """Deterministic scheduler that respects availability and daily capacity."""

    def schedule(
        self,
        *,
        priorities: Sequence[RankedTopic],
        availability: Sequence[TimeWindow],
        commitments: Sequence[FixedCommitment],
        exam_deadline: datetime,
        max_session_minutes: int,
        daily_cap_minutes: int,
        now: datetime,
    ) -> ScheduleResult:
        _validate_scheduler_input(priorities, availability, commitments, exam_deadline, now)
        if max_session_minutes <= 0 or daily_cap_minutes <= 0:
            raise ValueError("session and daily limits must be positive.")

        ordered_topics = _prerequisite_first(priorities)
        normalized_windows = _available_segments(
            availability,
            commitments,
            now,
            exam_deadline,
        )
        scheduled: list[ScheduledTask] = []
        daily_minutes: dict[date, int] = defaultdict(int)
        remaining_by_topic = {topic.topic_id: topic.duration_minutes for topic in ordered_topics}

        max_rounds = max(
            (ceil(topic.duration_minutes / max_session_minutes) for topic in ordered_topics), default=0
        )
        for _ in range(max_rounds):
            for topic in ordered_topics:
                remaining = remaining_by_topic[topic.topic_id]
                if remaining <= 0:
                    continue
                slot = self._find_slot(
                    topic=topic,
                    remaining=remaining,
                    windows=normalized_windows,
                    commitments=commitments,
                    scheduled=scheduled,
                    daily_minutes=daily_minutes,
                    exam_deadline=exam_deadline,
                    max_session_minutes=max_session_minutes,
                    daily_cap_minutes=daily_cap_minutes,
                )
                if slot is None:
                    continue
                task, window_index = slot
                scheduled.append(task)
                remaining_by_topic[topic.topic_id] -= task.duration_min
                daily_minutes[task.start_at.date()] += task.duration_min
                normalized_windows[window_index] = TimeWindow(
                    task.end_at,
                    normalized_windows[window_index].end_at,
                )

        unscheduled = {
            topic_id: remaining for topic_id, remaining in remaining_by_topic.items() if remaining > 0
        }
        return ScheduleResult(
            tasks=tuple(sorted(scheduled, key=lambda task: task.start_at)),
            infeasible=bool(unscheduled),
            shortfall_minutes=sum(unscheduled.values()),
            unscheduled_minutes=unscheduled,
        )

    @staticmethod
    def _find_slot(
        *,
        topic: RankedTopic,
        remaining: int,
        windows: Sequence[TimeWindow],
        commitments: Sequence[FixedCommitment],
        scheduled: Sequence[ScheduledTask],
        daily_minutes: dict[date, int],
        exam_deadline: datetime,
        max_session_minutes: int,
        daily_cap_minutes: int,
    ) -> tuple[ScheduledTask, int] | None:
        for index, window in enumerate(windows):
            if window.start_at >= window.end_at:
                continue
            available_minutes = int((window.end_at - window.start_at).total_seconds() // 60)
            daily_remaining = daily_cap_minutes - daily_minutes[window.start_at.date()]
            duration = min(remaining, max_session_minutes, available_minutes, daily_remaining)
            if duration <= 0:
                continue
            end_at = window.start_at + timedelta(minutes=duration)
            if end_at > exam_deadline:
                continue
            if _overlaps_scheduled(window.start_at, end_at, scheduled):
                continue
            return (
                ScheduledTask(
                    topic_id=topic.topic_id,
                    activity=topic.activity,
                    start_at=window.start_at,
                    duration_min=duration,
                    reason=topic.reason,
                    priority=topic.priority,
                ),
                index,
            )
        return None


def schedule_tasks(
    *,
    priorities: Sequence[RankedTopic],
    availability: Sequence[TimeWindow],
    commitments: Sequence[FixedCommitment],
    exam_deadline: datetime,
    max_session_minutes: int,
    daily_cap_minutes: int,
    now: datetime,
) -> ScheduleResult:
    """Stable scheduler entry point, currently backed by the greedy implementation."""
    return GreedyScheduler().schedule(
        priorities=priorities,
        availability=availability,
        commitments=commitments,
        exam_deadline=exam_deadline,
        max_session_minutes=max_session_minutes,
        daily_cap_minutes=daily_cap_minutes,
        now=now,
    )


def _prerequisite_first(priorities: Sequence[RankedTopic]) -> list[RankedTopic]:
    by_id = {topic.topic_id: topic for topic in priorities}
    if len(by_id) != len(priorities):
        raise ValueError("topic priorities must have unique topic IDs.")
    for topic in priorities:
        unknown = set(topic.prerequisites) - by_id.keys()
        if unknown:
            raise ValueError(f"Unknown prerequisites for {topic.topic_id}: {', '.join(sorted(unknown))}")

    ordered: list[RankedTopic] = []
    added: set[str] = set()
    remaining = set(by_id)
    while remaining:
        ready = [
            by_id[topic_id] for topic_id in remaining if set(by_id[topic_id].prerequisites).issubset(added)
        ]
        if not ready:
            raise ValueError("topic prerequisites contain a cycle.")
        ready.sort(key=lambda topic: (-topic.priority, topic.topic_id))
        selected = ready[0]
        ordered.append(selected)
        added.add(selected.topic_id)
        remaining.remove(selected.topic_id)
    return ordered


def _overlaps_commitment(
    start_at: datetime,
    end_at: datetime,
    commitments: Sequence[FixedCommitment],
) -> bool:
    return any(start_at < item.end_at and item.start_at < end_at for item in commitments)


def _available_segments(
    availability: Sequence[TimeWindow],
    commitments: Sequence[FixedCommitment],
    now: datetime,
    exam_deadline: datetime,
) -> list[TimeWindow]:
    segments: list[TimeWindow] = []
    for window in sorted(availability, key=lambda item: item.start_at):
        start_at = max(window.start_at, now)
        end_at = min(window.end_at, exam_deadline)
        if end_at <= start_at:
            continue
        blockers = sorted(
            (item for item in commitments if item.start_at < end_at and start_at < item.end_at),
            key=lambda item: item.start_at,
        )
        cursor = start_at
        for blocker in blockers:
            if blocker.start_at > cursor:
                segments.append(TimeWindow(cursor, min(blocker.start_at, end_at)))
            cursor = max(cursor, blocker.end_at)
            if cursor >= end_at:
                break
        if cursor < end_at:
            segments.append(TimeWindow(cursor, end_at))
    return segments


def _overlaps_scheduled(
    start_at: datetime,
    end_at: datetime,
    scheduled: Sequence[ScheduledTask],
) -> bool:
    return any(start_at < task.end_at and task.start_at < end_at for task in scheduled)


def _validate_scheduler_input(
    priorities: Sequence[RankedTopic],
    availability: Sequence[TimeWindow],
    commitments: Sequence[FixedCommitment],
    exam_deadline: datetime,
    now: datetime,
) -> None:
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be timezone-aware.")
    if exam_deadline.tzinfo is None or exam_deadline.utcoffset() is None:
        raise ValueError("exam_deadline must be timezone-aware.")
    if exam_deadline <= now:
        raise ValueError("exam_deadline must be after now.")
    for window in availability:
        if (
            window.start_at.tzinfo is None
            or window.start_at.utcoffset() is None
            or window.end_at.tzinfo is None
            or window.end_at.utcoffset() is None
        ):
            raise ValueError("availability windows must be timezone-aware.")
        if window.end_at <= window.start_at:
            raise ValueError("availability window end must be after start.")
    for commitment in commitments:
        if (
            commitment.start_at.tzinfo is None
            or commitment.start_at.utcoffset() is None
            or commitment.end_at.tzinfo is None
            or commitment.end_at.utcoffset() is None
        ):
            raise ValueError("fixed commitments must be timezone-aware.")
        if commitment.end_at <= commitment.start_at:
            raise ValueError("fixed commitment end must be after start.")
    for topic in priorities:
        if not 0 <= topic.priority <= 1:
            raise ValueError("topic priorities must be between zero and one.")
        if topic.duration_minutes <= 0:
            raise ValueError("topic duration_minutes must be positive.")
