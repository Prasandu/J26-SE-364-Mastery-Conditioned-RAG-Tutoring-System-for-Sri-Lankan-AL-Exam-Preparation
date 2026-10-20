from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta


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
    reason_details: dict | None = None
    question_ids: tuple[str, ...] = ()
    declining: bool = False
    studied: bool = False


@dataclass(frozen=True)
class ScheduledTask:
    topic_id: str
    activity: str
    start_at: datetime
    duration_min: int
    reason: str
    priority: float
    reason_details: dict | None = None
    question_ids: tuple[str, ...] = ()
    declining: bool = False
    studied: bool = False

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
        existing_daily_minutes: Mapping[date, int] | None = None,
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
        # Minutes already booked per day (sessions that are kept) count toward the cap.
        daily_minutes: dict[date, int] = defaultdict(int, existing_daily_minutes or {})
        remaining_by_topic = {topic.topic_id: topic.duration_minutes for topic in ordered_topics}

        weekly_topics: dict[tuple[int, int], set[str]] = defaultdict(set)
        last_topic_id: str | None = None
        last_task_date: date | None = None
        consecutive_topic_count = 0
        topic_order = {topic.topic_id: index for index, topic in enumerate(ordered_topics)}

        while True:
            candidates = []
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
                if slot is not None:
                    candidates.append((topic, slot))
            if not candidates:
                break

            if consecutive_topic_count >= 2:
                # At most two back-to-back sessions of a topic on the same day.
                candidates = [
                    candidate
                    for candidate in candidates
                    if candidate[0].topic_id != last_topic_id
                    or candidate[1][0].start_at.date() != last_task_date
                ]
                if not candidates:
                    # Nothing else can use today's remaining time: move on to the next day.
                    normalized_windows = [
                        TimeWindow(window.end_at, window.end_at)
                        if window.start_at.date() == last_task_date
                        else window
                        for window in normalized_windows
                    ]
                    consecutive_topic_count = 0
                    continue

            earliest_start = min(slot[0].start_at for _, slot in candidates)
            candidates = [
                candidate
                for candidate in candidates
                if candidate[1][0].start_at == earliest_start
            ]
            week = earliest_start.isocalendar()[:2]
            topic, (task, window_index) = min(
                candidates,
                key=lambda candidate: (
                    candidate[0].topic_id in weekly_topics[week],
                    -candidate[0].priority,
                    topic_order[candidate[0].topic_id],
                ),
            )
            scheduled.append(task)
            remaining_by_topic[topic.topic_id] -= task.duration_min
            daily_minutes[task.start_at.date()] += task.duration_min
            weekly_topics[week].add(topic.topic_id)
            if topic.topic_id == last_topic_id and task.start_at.date() == last_task_date:
                consecutive_topic_count += 1
            else:
                last_topic_id = topic.topic_id
                consecutive_topic_count = 1
            last_task_date = task.start_at.date()
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
                    reason_details=topic.reason_details,
                    question_ids=topic.question_ids,
                    declining=topic.declining,
                    studied=topic.studied,
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
    existing_daily_minutes: Mapping[date, int] | None = None,
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
        existing_daily_minutes=existing_daily_minutes,
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
