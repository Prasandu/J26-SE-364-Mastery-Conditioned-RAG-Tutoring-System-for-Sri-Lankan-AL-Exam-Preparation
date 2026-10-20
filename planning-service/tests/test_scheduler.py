import random
from datetime import UTC, datetime, timedelta

from app.services.scheduler import (
    FixedCommitment,
    RankedTopic,
    TimeWindow,
    schedule_tasks,
)


def test_scheduler_respects_hard_constraints_for_200_randomized_inputs() -> None:
    rng = random.Random(364)
    base = datetime(2027, 1, 4, 0, tzinfo=UTC)

    for _ in range(200):
        day_count = rng.randint(1, 5)
        windows: list[TimeWindow] = []
        commitments: list[FixedCommitment] = []
        for day in range(day_count):
            window_start = base + timedelta(days=day, hours=rng.randint(7, 10))
            window = TimeWindow(window_start, window_start + timedelta(hours=rng.randint(2, 6)))
            windows.append(window)
            if rng.choice([True, False]):
                commitment_start = window.start_at + timedelta(minutes=rng.randint(15, 60))
                commitment_end = min(
                    commitment_start + timedelta(minutes=rng.randint(15, 45)),
                    window.end_at,
                )
                if commitment_start < commitment_end:
                    commitments.append(FixedCommitment(commitment_start, commitment_end))

        topics = [
            RankedTopic(
                topic_id=f"topic-{index}",
                activity="practice",
                priority=rng.random(),
                duration_minutes=rng.randint(15, 240),
                reason="test",
            )
            for index in range(rng.randint(1, 6))
        ]
        max_session = rng.randint(15, 90)
        daily_cap = rng.randint(15, 180)
        now = base + timedelta(hours=9)
        deadline = base + timedelta(days=day_count + 1)

        result = schedule_tasks(
            priorities=topics,
            availability=windows,
            commitments=commitments,
            exam_deadline=deadline,
            max_session_minutes=max_session,
            daily_cap_minutes=daily_cap,
            now=now,
        )

        assert result.shortfall_minutes == sum(result.unscheduled_minutes.values())
        assert result.infeasible is bool(result.unscheduled_minutes)
        daily_totals: dict[object, int] = {}
        for task in result.tasks:
            assert task.start_at >= now
            assert task.end_at <= deadline
            assert task.duration_min <= max_session
            assert any(
                window.start_at <= task.start_at and task.end_at <= window.end_at for window in windows
            )
            assert not any(
                task.start_at < block.end_at and block.start_at < task.end_at for block in commitments
            )
            daily_totals[task.start_at.date()] = daily_totals.get(task.start_at.date(), 0) + task.duration_min
        assert all(minutes <= daily_cap for minutes in daily_totals.values())
        assert all(
            left.end_at <= right.start_at for left, right in zip(result.tasks, result.tasks[1:], strict=False)
        )


def test_scheduler_reports_shortfall_without_available_time() -> None:
    result = schedule_tasks(
        priorities=[
            RankedTopic("chem-1", "practice", 0.8, 45, "weak topic"),
        ],
        availability=[],
        commitments=[],
        exam_deadline=datetime(2027, 1, 10, tzinfo=UTC),
        max_session_minutes=30,
        daily_cap_minutes=90,
        now=datetime(2027, 1, 1, tzinfo=UTC),
    )

    assert result.tasks == ()
    assert result.infeasible
    assert result.shortfall_minutes == 45
    assert result.unscheduled_minutes == {"chem-1": 45}


def test_scheduler_interleaves_topics_and_limits_consecutive_sessions() -> None:
    now = datetime(2026, 10, 19, 8, tzinfo=UTC)
    deadline = now + timedelta(days=14)
    # 6 available slots of 60 min
    windows = [
        TimeWindow(now + timedelta(hours=i * 2), now + timedelta(hours=i * 2 + 1))
        for i in range(6)
    ]
    # Two topics, each needing 180 min (3 slots of 60 min)
    topics = [
        RankedTopic("ketones", "theory", 0.9, 180, "weak topic"),
        RankedTopic("alkanes", "theory", 0.8, 180, "weak topic"),
    ]
    result = schedule_tasks(
        priorities=topics,
        availability=windows,
        commitments=[],
        exam_deadline=deadline,
        max_session_minutes=60,
        daily_cap_minutes=360,
        now=now,
    )
    scheduled_topic_sequence = [t.topic_id for t in result.tasks]
    assert len(scheduled_topic_sequence) == 6
    # No more than 2 consecutive sessions of the same topic
    for i in range(len(scheduled_topic_sequence) - 2):
        assert not (
            scheduled_topic_sequence[i]
            == scheduled_topic_sequence[i + 1]
            == scheduled_topic_sequence[i + 2]
        )


def test_single_remaining_topic_continues_on_later_days() -> None:
    now = datetime(2026, 10, 19, 8, tzinfo=UTC)
    windows = [
        TimeWindow(now + timedelta(days=day, hours=hour), now + timedelta(days=day, hours=hour + 1))
        for day in range(3)
        for hour in range(4)
    ]
    result = schedule_tasks(
        priorities=[RankedTopic("ketones", "theory", 0.9, 360, "only topic")],
        availability=windows,
        commitments=[],
        exam_deadline=now + timedelta(days=14),
        max_session_minutes=60,
        daily_cap_minutes=240,
        now=now,
    )

    sessions_per_day: dict[object, int] = {}
    for task in result.tasks:
        sessions_per_day[task.start_at.date()] = sessions_per_day.get(task.start_at.date(), 0) + 1
    assert sum(task.duration_min for task in result.tasks) == 360
    assert list(sessions_per_day.values()) == [2, 2, 2]
    assert not result.infeasible


def test_minutes_already_booked_count_toward_the_daily_cap() -> None:
    now = datetime(2026, 10, 19, 8, tzinfo=UTC)
    windows = [TimeWindow(now, now + timedelta(hours=4))]

    result = schedule_tasks(
        priorities=[RankedTopic("ketones", "theory", 0.9, 120, "missed work")],
        availability=windows,
        commitments=[],
        exam_deadline=now + timedelta(days=14),
        max_session_minutes=60,
        daily_cap_minutes=120,
        now=now,
        existing_daily_minutes={now.date(): 90},
    )

    assert sum(task.duration_min for task in result.tasks) == 30
    assert result.unscheduled_minutes == {"ketones": 90}
