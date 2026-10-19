import random
import re
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import pytest

from app.main import app
from app.models import MotivationState, StudyPlan, StudyTask, TopicEvidence
from app.services import motivation
from app.services.motivation import (
    CATEGORIES,
    Situation,
    choose_category,
    draw_message,
    is_high_stress,
    load_messages,
    personalise,
    todays_motivation,
)

NOW = datetime(2026, 10, 20, 4, 30, tzinfo=UTC)  # 10:00 in Colombo


def situation(**overrides: Any) -> Situation:
    values: dict[str, Any] = {
        "days_to_exam": 60,
        "missed_recently": False,
        "recent_decline": False,
        "adherence": None,
        "planned_minutes": 0,
        "study_days": 0,
    }
    values.update(overrides)
    return Situation(**values)


# --- Message file -------------------------------------------------------------


def test_message_file_has_80_warm_messages_in_five_categories() -> None:
    messages = load_messages()

    assert len(messages) == 80
    assert Counter(message.category for message in messages) == {category: 16 for category in CATEGORIES}
    assert len({message.id for message in messages}) == 80
    banned = re.compile(
        r"\b(guarantee\w*|will get an?|grade|behind|lazy|fail\w*|must|disappoint\w*|should have)\b",
        re.IGNORECASE,
    )
    assert [message.id for message in messages if banned.search(message.text)] == []
    assert all(len(message.text) <= 120 for message in messages)


def test_name_is_used_when_known_and_removed_cleanly_otherwise() -> None:
    text = "Hard topics feel hard because you're growing. That's a good sign, {name}."

    without_name = "Hard topics feel hard because you're growing. That's a good sign."

    assert personalise(text, "Uvindu") == without_name.replace("sign.", "sign, Uvindu.")
    assert personalise(text, None) == without_name
    assert personalise(text, "there") == without_name


# --- Shuffle bag --------------------------------------------------------------


def test_shuffle_bag_shows_every_message_once_before_any_repeat() -> None:
    messages = load_messages()
    rng = random.Random(1)
    shown: list[str] = []
    last: str | None = None
    drawn = []
    for _ in range(16):
        message, shown = draw_message(messages, "effort", shown, last, rng)
        drawn.append(message.id)
        last = message.id

    assert len(set(drawn)) == 16
    refill, shown = draw_message(messages, "effort", shown, last, rng)
    assert refill.id != last
    assert shown == [refill.id]


def test_never_the_same_message_on_consecutive_days() -> None:
    messages = load_messages()
    rng = random.Random(7)
    shown: list[str] = []
    last: str | None = None
    for day in range(400):
        category = CATEGORIES[day % 2] if day % 5 else "recovery"
        message, shown = draw_message(messages, category, shown, last, rng)
        assert message.id != last
        last = message.id


def test_bags_are_per_category_so_other_categories_keep_their_progress() -> None:
    messages = load_messages()
    shown = [message.id for message in messages if message.category == "celebration"]
    shown.append("effort-01")

    message, updated = draw_message(messages, "celebration", shown, "celebration-16", random.Random(3))

    assert message.category == "celebration" and message.id != "celebration-16"
    assert "effort-01" in updated
    assert not any(item.startswith("celebration") and item != message.id for item in updated)


# --- Category selection -----------------------------------------------------------


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({"days_to_exam": 5, "missed_recently": True}, "exam_week"),
        ({"days_to_exam": 7}, "exam_week"),
        ({"days_to_exam": 0}, "effort"),
        ({"missed_recently": True, "adherence": 0.95, "planned_minutes": 300}, "recovery"),
        ({"recent_decline": True}, "recovery"),
        ({"adherence": 0.85, "planned_minutes": 240, "study_days": 4}, "celebration"),
        ({"adherence": 0.85, "planned_minutes": 30, "study_days": 1}, "effort"),
        ({"adherence": 0.6, "planned_minutes": 240, "study_days": 4}, "consistency"),
        ({"adherence": 0.4, "planned_minutes": 240, "study_days": 1}, "effort"),
        ({"days_to_exam": None}, "effort"),
    ],
)
def test_category_follows_the_students_situation(overrides: dict[str, Any], expected: str) -> None:
    assert choose_category(situation(**overrides)) == expected


# --- Daily endpoint behaviour ------------------------------------------------


class Scalars:
    def __init__(self, values: list[Any]) -> None:
        self.values = values

    def all(self) -> list[Any]:
        return self.values

    def first(self) -> Any:
        return self.values[0] if self.values else None


class FakeSession:
    def __init__(self, *, tasks: list[Any] | None = None, exam_in_days: int = 60) -> None:
        self.plan = SimpleNamespace(
            student_id="student-1",
            exam_date=date(2026, 10, 20) + timedelta(days=exam_in_days),
            created_at=NOW,
            constraints={"timezone": "Asia/Colombo"},
        )
        self.tasks = tasks or []
        self.state: Any = None
        self.commits = 0

    def get(self, model: type, _key: Any) -> Any:
        return self.state if model is MotivationState else None

    def scalars(self, statement: Any) -> Scalars:
        entity = statement.column_descriptions[0]["entity"]
        if entity is StudyPlan:
            return Scalars([self.plan])
        if entity is StudyTask:
            return Scalars(self.tasks)
        if entity is TopicEvidence:
            return Scalars([])
        return Scalars([])

    def add(self, record: Any) -> None:
        self.state = record

    def commit(self) -> None:
        self.commits += 1


def never_stressed(_student_id: str) -> bool:
    return False


def test_same_day_returns_the_same_message_and_next_day_a_new_one() -> None:
    session = FakeSession()

    first = todays_motivation(session, "student-1", first_name="Uvindu", now=NOW, stress_check=never_stressed)  # type: ignore[arg-type]
    again = todays_motivation(  # type: ignore[arg-type]
        session, "student-1", first_name="Uvindu", now=NOW + timedelta(hours=8), stress_check=never_stressed
    )
    tomorrow = todays_motivation(  # type: ignore[arg-type]
        session, "student-1", first_name="Uvindu", now=NOW + timedelta(days=1), stress_check=never_stressed
    )

    assert first.message_id == again.message_id and first.text == again.text
    assert session.commits == 2  # the repeat call changed nothing
    assert tomorrow.message_id != first.message_id
    assert tomorrow.date == date(2026, 10, 21)
    assert session.state.shown_ids == [first.message_id, tomorrow.message_id]
    assert "{name}" not in (first.text or "")


def test_situation_from_plan_and_tasks_picks_the_category() -> None:
    missed = SimpleNamespace(
        status="missed",
        start_at=NOW - timedelta(days=1),
        duration_min=60,
        actual_duration_min=None,
    )

    exam_week = todays_motivation(  # type: ignore[arg-type]
        FakeSession(exam_in_days=4), "student-1", now=NOW, stress_check=never_stressed
    )
    recovery = todays_motivation(  # type: ignore[arg-type]
        FakeSession(tasks=[missed]), "student-1", now=NOW, stress_check=never_stressed
    )

    assert exam_week.category == "exam_week"
    assert recovery.category == "recovery"


def test_high_stress_flag_skips_the_card_without_using_up_a_message() -> None:
    session = FakeSession()

    result = todays_motivation(session, "student-1", now=NOW, stress_check=lambda _student: True)  # type: ignore[arg-type]

    assert result.suppressed and result.text is None
    assert session.state is None and session.commits == 0


def test_stress_hook_is_configurable_and_failures_show_the_card(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(motivation.settings, "motivation_stress_hook", "")
    assert is_high_stress("student-1") is False

    monkeypatch.setattr(motivation.settings, "motivation_stress_hook", "tests.test_motivation:flag_everyone")
    assert is_high_stress("student-1") is True

    monkeypatch.setattr(motivation.settings, "motivation_stress_hook", "no.such.module:check")
    assert is_high_stress("student-1") is False


def flag_everyone(_student_id: str) -> bool:
    return True


def test_motivation_route_is_registered() -> None:
    assert "/api/v1/motivation/today" in app.openapi()["paths"]
