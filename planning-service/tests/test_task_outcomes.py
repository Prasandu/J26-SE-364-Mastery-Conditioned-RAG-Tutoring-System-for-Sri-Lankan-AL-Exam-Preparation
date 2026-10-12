from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.errors import Conflict
from app.main import app
from app.models import StudyPlan, StudyTask
from app.schemas.tasks import ScheduleResponse, TaskStatusUpdate
from app.services import task_outcomes


def test_outcome_schema_requires_paired_scores() -> None:
    with pytest.raises(ValueError, match="provided together"):
        TaskStatusUpdate(status="completed", score_before=0.4)


def test_outcome_schema_requires_positive_partial_duration() -> None:
    with pytest.raises(ValueError, match="greater than zero"):
        TaskStatusUpdate(status="partial", actual_duration_min=0)


def test_outcome_schema_rejects_zero_duration_for_completed_task() -> None:
    with pytest.raises(ValueError, match="greater than zero"):
        TaskStatusUpdate(status="completed", actual_duration_min=0)


def test_partial_outcome_replans_only_remaining_minutes(monkeypatch: pytest.MonkeyPatch) -> None:
    task = SimpleNamespace(
        id=uuid4(),
        plan_id=uuid4(),
        student_id="student-1",
        topic_id="chem-u1",
        activity="practice",
        start_at=datetime(2027, 1, 1, tzinfo=UTC),
        duration_min=60,
        status="planned",
        reason="priority",
        replanned_from=None,
        actual_duration_min=None,
        score_before=None,
        score_after=None,
    )
    plan = SimpleNamespace(
        constraints={"priorities": [{"topic_id": task.topic_id, "priority": 0.6}]},
    )

    class FakeSession:
        added: list[object] = []
        committed = False

        def get(self, model: type, _identifier: object) -> object | None:
            return task if model is StudyTask else plan if model is StudyPlan else None

        def add(self, record: object) -> None:
            self.added.append(record)

        def commit(self) -> None:
            self.committed = True

    captured: dict[str, object] = {}

    def fake_generate(
        _session: object,
        _student_id: str,
        _plan_id: object,
        **kwargs: object,
    ) -> ScheduleResponse:
        captured.update(kwargs)
        return ScheduleResponse(
            tasks=[],
            infeasible=False,
            shortfall_minutes=0,
            unscheduled_minutes={},
        )

    monkeypatch.setattr(task_outcomes, "generate_plan_schedule", fake_generate)
    session = FakeSession()
    result = task_outcomes.update_task_status(
        session,  # type: ignore[arg-type]
        "student-1",
        task.id,
        TaskStatusUpdate(
            status="partial",
            actual_duration_min=25,
            score_before=0.4,
            score_after=0.55,
        ),
    )

    assert captured["duration_overrides"] == {task.topic_id: 35}
    assert captured["replanned_from"] == {task.topic_id: task.id}
    assert captured["priority_overrides"] == {task.topic_id: 0.85}
    assert result.actual_minutes == 25
    assert result.score_change == pytest.approx(0.15)
    assert result.replanned
    assert session.committed


def test_missed_outcome_replans_full_duration(monkeypatch: pytest.MonkeyPatch) -> None:
    task = SimpleNamespace(
        id=uuid4(),
        plan_id=uuid4(),
        student_id="student-1",
        topic_id="chem-u1",
        activity="practice",
        start_at=datetime(2027, 1, 1, tzinfo=UTC),
        duration_min=45,
        status="planned",
        reason="priority",
        replanned_from=None,
        actual_duration_min=None,
        score_before=None,
        score_after=None,
    )
    plan = SimpleNamespace(
        constraints={"priorities": [{"topic_id": task.topic_id, "priority": 0.6}]},
    )

    class FakeSession:
        def get(self, model: type, _identifier: object) -> object | None:
            return task if model is StudyTask else plan if model is StudyPlan else None

        def add(self, _record: object) -> None:
            pass

        def commit(self) -> None:
            pass

    captured: dict[str, object] = {}

    def fake_generate(
        _session: object,
        _student_id: str,
        _plan_id: object,
        **kwargs: object,
    ) -> ScheduleResponse:
        captured.update(kwargs)
        return ScheduleResponse(
            tasks=[],
            infeasible=False,
            shortfall_minutes=0,
            unscheduled_minutes={},
        )

    monkeypatch.setattr(task_outcomes, "generate_plan_schedule", fake_generate)
    task_outcomes.update_task_status(
        FakeSession(),  # type: ignore[arg-type]
        "student-1",
        task.id,
        TaskStatusUpdate(status="missed"),
    )

    assert captured["duration_overrides"] == {task.topic_id: 45}


def test_task_outcome_cannot_be_changed_twice() -> None:
    task = SimpleNamespace(student_id="student-1", status="completed")

    class FakeSession:
        def get(self, _model: type, _identifier: object) -> object:
            return task

    with pytest.raises(Conflict):
        task_outcomes.update_task_status(
            FakeSession(),  # type: ignore[arg-type]
            "student-1",
            uuid4(),
            TaskStatusUpdate(status="missed"),
        )


def test_schedule_and_weekly_replan_routes_are_registered() -> None:
    paths = app.openapi()["paths"]

    assert "/api/v1/plans/{plan_id}/generate" in paths
    assert "/api/v1/plans/{plan_id}/weekly-replan" in paths
    assert "/api/v1/tasks/{task_id}/status" in paths


def test_weekly_replan_reports_outcomes_and_preserves_manual_priorities(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan_id = uuid4()
    original_priorities = [{"topic_id": "chem-u1", "priority": 0.73}]
    plan = SimpleNamespace(
        id=plan_id,
        student_id="student-1",
        mode="manual",
        exam_date=datetime(2027, 2, 1, tzinfo=UTC).date(),
        constraints={"priorities": original_priorities},
    )
    task = SimpleNamespace(
        duration_min=60,
        actual_duration_min=40,
        status="partial",
        score_before=0.4,
        score_after=0.6,
        start_at=datetime(2027, 1, 5, tzinfo=UTC),
    )
    state = SimpleNamespace(
        topic_id="chem-u1",
        mastery=0.62,
        trend=0.1,
        error_rate=0.2,
        interval_days=3,
    )
    created_predictions: list[object] = []
    generated: dict[str, object] = {}

    class FakeScalarResults:
        def __init__(self, results: list[object]) -> None:
            self.results = results

        def all(self) -> list[object]:
            return self.results

    class FakeSession:
        scalar_results = [
            [task],
            ["chem-u1"],
            [state],
        ]

        def __init__(self) -> None:
            self.scalar_call = 0
            self.committed = False

        def get(self, _model: type, _identifier: object) -> object:
            return plan

        def scalars(self, _statement: object) -> FakeScalarResults:
            result = self.scalar_results[self.scalar_call]
            self.scalar_call += 1
            return FakeScalarResults(result)

        def execute(self, _statement: object) -> FakeScalarResults:
            return FakeScalarResults([("chem-u1", 2)])

        def add_all(self, records: list[object]) -> None:
            created_predictions.extend(records)

        def add(self, _record: object) -> None:
            pass

        def flush(self) -> None:
            pass

        def commit(self) -> None:
            self.committed = True

    def fake_generate(
        _session: object,
        _student_id: str,
        _plan_id: object,
        **kwargs: object,
    ) -> ScheduleResponse:
        generated.update(kwargs)
        return ScheduleResponse(
            tasks=[],
            infeasible=False,
            shortfall_minutes=0,
            unscheduled_minutes={},
        )

    monkeypatch.setattr(task_outcomes, "recompute_for", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(task_outcomes, "generate_plan_schedule", fake_generate)
    session = FakeSession()
    result = task_outcomes.weekly_replan(
        session,  # type: ignore[arg-type]
        "student-1",
        plan_id,
        now=datetime(2027, 1, 8, tzinfo=UTC),
    )

    assert result.planned_minutes == 60
    assert result.completed_minutes == 40
    assert result.adherence == pytest.approx(2 / 3)
    assert result.average_score_change == pytest.approx(0.2)
    assert result.predictions_created == 1
    assert created_predictions[0].model_version == "weekly-rule-based-v1"
    assert generated["horizon_days"] == 7
    assert plan.constraints["priorities"] == original_priorities
    assert session.committed
