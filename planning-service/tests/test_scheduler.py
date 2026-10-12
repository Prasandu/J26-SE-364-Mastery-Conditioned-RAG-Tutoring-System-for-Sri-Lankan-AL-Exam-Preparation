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
