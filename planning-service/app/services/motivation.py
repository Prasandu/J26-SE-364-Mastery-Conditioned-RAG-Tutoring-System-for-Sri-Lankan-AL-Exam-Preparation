"""One warm motivation message per student per day.

* Category comes from the student's situation (``choose_category``).
* Messages are drawn from a per-student shuffle bag (``draw_message``): every
  message in a category is shown once before any repeats, and never the same
  message on two consecutive days.
* The same day always returns the same message (idempotent).
* An optional well-being hook can suppress the card for highly stressed
  students, so this component never competes with that one.
"""

from __future__ import annotations

import importlib
import json
import logging
import random
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from functools import lru_cache
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import MotivationState, StudyPlan, StudyTask, TopicEvidence
from app.schemas.motivation import MotivationResponse
from app.services.decline import detect_declines
from app.services.notifications import student_zone
from app.services.weights import (
    MOTIVATION_CELEBRATION_ADHERENCE,
    MOTIVATION_CELEBRATION_MIN_MINUTES,
    MOTIVATION_CONSISTENCY_MIN_DAYS,
    MOTIVATION_DECLINE_RECENT_DAYS,
    MOTIVATION_EXAM_WEEK_DAYS,
    MOTIVATION_RECOVERY_LOOKBACK_DAYS,
)

logger = logging.getLogger(__name__)

CATEGORIES = ("effort", "consistency", "recovery", "exam_week", "celebration")
DEFAULT_MESSAGES_PATH = (
    Path(__file__).resolve().parents[3] / "shared" / "contracts" / "motivation_messages.json"
)
_NAME_PLACEHOLDER = re.compile(r",?\s*\{name\}")


@dataclass(frozen=True)
class Message:
    id: str
    category: str
    text: str


@dataclass(frozen=True)
class Situation:
    days_to_exam: int | None
    missed_recently: bool
    recent_decline: bool
    adherence: float | None
    planned_minutes: int
    study_days: int


def choose_category(situation: Situation) -> str:
    """Exam week first, then recovery, celebration, and consistency or effort."""
    if situation.days_to_exam is not None and 0 < situation.days_to_exam <= MOTIVATION_EXAM_WEEK_DAYS:
        return "exam_week"
    if situation.missed_recently or situation.recent_decline:
        return "recovery"
    if (
        situation.adherence is not None
        and situation.adherence >= MOTIVATION_CELEBRATION_ADHERENCE
        and situation.planned_minutes >= MOTIVATION_CELEBRATION_MIN_MINUTES
    ):
        return "celebration"
    if situation.study_days >= MOTIVATION_CONSISTENCY_MIN_DAYS:
        return "consistency"
    return "effort"


def draw_message(
    messages: Sequence[Message],
    category: str,
    shown_ids: Sequence[str],
    last_message_id: str | None,
    rng: random.Random,
) -> tuple[Message, list[str]]:
    """Shuffle-bag draw. Returns the message and the updated list of shown IDs.

    When every message in the category has been shown, that category's bag is
    refilled, leaving out yesterday's message so it cannot repeat.
    """
    pool = [message for message in messages if message.category == category]
    if not pool:
        raise ValueError(f"No motivation messages in category {category!r}.")
    shown = list(shown_ids)
    remaining = [message for message in pool if message.id not in shown]
    if not remaining:
        pool_ids = {message.id for message in pool}
        shown = [message_id for message_id in shown if message_id not in pool_ids]
        remaining = [message for message in pool if message.id != last_message_id] or pool
    choice = rng.choice(remaining)
    return choice, [*shown, choice.id]


def personalise(text: str, first_name: str | None) -> str:
    name = (first_name or "").strip()
    if name and name.lower() != "there":
        return text.replace("{name}", name)
    return _NAME_PLACEHOLDER.sub("", text)


def todays_motivation(
    session: Session,
    student_id: str,
    *,
    first_name: str | None = None,
    now: datetime | None = None,
    stress_check: Callable[[str], bool] | None = None,
) -> MotivationResponse:
    current = (now or datetime.now(UTC)).astimezone(UTC)
    today = current.astimezone(student_zone(session, student_id)).date()
    if (stress_check or is_high_stress)(student_id):
        return MotivationResponse(date=today, suppressed=True)

    messages = load_messages()
    by_id = {message.id: message for message in messages}
    state = session.get(MotivationState, student_id)
    if (
        state is not None
        and state.last_shown_date == today
        and state.last_message_id in by_id
    ):
        message = by_id[state.last_message_id]
        return _response(today, message, first_name)

    category = choose_category(_situation(session, student_id, current, today))
    message, shown = draw_message(
        messages,
        category,
        state.shown_ids if state is not None else [],
        state.last_message_id if state is not None else None,
        random.Random(f"{student_id}:{today.isoformat()}"),
    )
    if state is None:
        state = MotivationState(student_id=student_id)
        session.add(state)
    state.shown_ids = shown
    state.last_shown_date = today
    state.last_message_id = message.id
    state.last_category = category
    session.commit()
    return _response(today, message, first_name)


def is_high_stress(student_id: str) -> bool:
    """Ask the configured well-being hook; any failure means "not flagged"."""
    hook = settings.motivation_stress_hook.strip()
    if not hook:
        return False
    try:
        module_name, _, function_name = hook.partition(":")
        function = getattr(importlib.import_module(module_name), function_name)
        return bool(function(student_id))
    except Exception:  # noqa: BLE001 - a broken optional hook must not break the dashboard
        logger.warning("Motivation stress hook %r failed; showing the card.", hook, exc_info=True)
        return False


@lru_cache(maxsize=4)
def _load_messages(path: str) -> tuple[Message, ...]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    messages = tuple(
        Message(id=item["id"], category=item["category"], text=item["text"]) for item in data["messages"]
    )
    ids = [message.id for message in messages]
    if len(set(ids)) != len(ids):
        raise ValueError("Motivation message IDs must be unique.")
    unknown = {message.category for message in messages} - set(CATEGORIES)
    if unknown:
        raise ValueError(f"Unknown motivation categories: {sorted(unknown)}")
    missing = set(CATEGORIES) - {message.category for message in messages}
    if missing:
        raise ValueError(f"Motivation categories without messages: {sorted(missing)}")
    return messages


def load_messages() -> tuple[Message, ...]:
    return _load_messages(str(settings.motivation_messages_path or DEFAULT_MESSAGES_PATH))


def _situation(session: Session, student_id: str, now: datetime, today: date) -> Situation:
    plan = session.scalars(
        select(StudyPlan).where(StudyPlan.student_id == student_id).order_by(StudyPlan.created_at.desc())
    ).first()
    days_to_exam = (plan.exam_date - today).days if plan is not None else None

    week_ago = now - timedelta(days=7)
    tasks = session.scalars(
        select(StudyTask).where(
            StudyTask.student_id == student_id,
            StudyTask.start_at >= week_ago,
            StudyTask.start_at < now,
        )
    ).all()
    recovery_since = now - timedelta(days=MOTIVATION_RECOVERY_LOOKBACK_DAYS)
    missed_recently = any(task.status == "missed" and task.start_at >= recovery_since for task in tasks)
    planned = sum(task.duration_min for task in tasks)
    completed = sum(
        task.actual_duration_min
        if task.actual_duration_min is not None
        else task.duration_min if task.status == "completed" else 0
        for task in tasks
        if task.status in {"completed", "partial"}
    )
    study_days = len({task.start_at.date() for task in tasks if task.status in {"completed", "partial"}})

    evidence = session.scalars(
        select(TopicEvidence)
        .where(
            TopicEvidence.student_id == student_id,
            TopicEvidence.observed_at >= now - timedelta(days=90),
        )
        .order_by(TopicEvidence.observed_at)
    ).all()
    attempts: dict[str, list[dict]] = {}
    for row in evidence:
        attempts.setdefault(row.topic_id, []).append(
            {"score": row.score, "max_score": row.max_score, "attempted_at": row.observed_at}
        )
    decline_since = now - timedelta(days=MOTIVATION_DECLINE_RECENT_DAYS)
    recent_decline = any(alert.latest_attempt_at >= decline_since for alert in detect_declines(attempts))

    return Situation(
        days_to_exam=days_to_exam,
        missed_recently=missed_recently,
        recent_decline=recent_decline,
        adherence=completed / planned if planned else None,
        planned_minutes=planned,
        study_days=study_days,
    )


def _response(today: date, message: Message, first_name: str | None) -> MotivationResponse:
    return MotivationResponse(
        date=today,
        category=message.category,  # type: ignore[arg-type]
        message_id=message.id,
        text=personalise(message.text, first_name),
    )
