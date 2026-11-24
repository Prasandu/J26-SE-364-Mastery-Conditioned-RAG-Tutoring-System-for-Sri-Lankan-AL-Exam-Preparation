from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.models import Topic
from app.services.decline import detect_decline
from app.services.scheduler import TimeWindow, schedule_tasks
from app.services.scheduling import _ranked_topics


def attempt(score: float, index: int) -> dict:
    return {
        "score": score,
        "max_score": 10,
        "attempted_at": datetime(2026, 10, 1, tzinfo=UTC) + timedelta(days=index),
    }


def test_stable_high_scores_do_not_produce_decline_alert() -> None:
    assert detect_decline("chem-u1", [attempt(10, index) for index in range(5)]) is None


def test_decline_alert_compares_last_three_to_best_earlier_attempts() -> None:
    alert = detect_decline(
        "chem-u1",
        [attempt(score, index) for index, score in enumerate((10, 10, 6, 5, 5))],
        topic_name="Atomic Structure",
    )

    assert alert is not None
    assert alert.baseline == 1
    assert round(alert.recent, 3) == 0.533
    assert round(alert.drop, 3) == 0.467
    assert "10/10 earlier in Atomic Structure" in alert.message
    assert "6/10, 5/10, 5/10" in alert.message
    assert len(alert.attempts) == 5


def test_fewer_than_three_attempts_do_not_produce_alert() -> None:
    assert detect_decline("chem-u1", [attempt(10, 0), attempt(1, 1)]) is None


def test_decline_alert_disappears_after_scores_recover() -> None:
    history = (10, 10, 6, 5, 5, 10, 10, 10)

    assert detect_decline(
        "chem-u1",
        [attempt(score, index) for index, score in enumerate(history)],
    ) is None


def test_decline_boosts_topic_priority_and_schedules_recovery_revision_first() -> None:
    topic = SimpleNamespace(
        id="chem-u1",
        name="Atomic Structure",
        exam_weight=0.8,
        prerequisites=[],
    )
    state = SimpleNamespace(topic_id="chem-u1", mastery=0.6, error_rate=0.1, next_review_at=None)
    evidence = [
        SimpleNamespace(
            topic_id="chem-u1",
            score=score,
            max_score=10,
            observed_at=attempt(score, index)["attempted_at"],
            question_id=f"q-{index}",
        )
        for index, score in enumerate((10, 10, 6, 5, 5))
    ]

    class Session:
        def get(self, model, _key):
            assert model is Topic
            return topic

        def scalars(self, statement):
            if "learner_topic_state" in str(statement):
                rows = [state]
            elif "topic_evidence" in str(statement):
                rows = evidence
            else:
                rows = []
            return SimpleNamespace(all=lambda: rows)

    ranked = _ranked_topics(
        Session(),
        "student-1",
        {
            "priorities": [{"topic_id": "chem-u1", "priority": 0.1}],
            "max_session_minutes": 60,
        },
        duration_overrides={},
        priority_overrides={},
        as_of=datetime(2026, 10, 10, tzinfo=UTC),
    )[0]

    scheduled = schedule_tasks(
        priorities=[ranked],
        availability=[
            TimeWindow(
                datetime(2026, 10, 11, 9, tzinfo=UTC),
                datetime(2026, 10, 11, 11, tzinfo=UTC),
            )
        ],
        commitments=[],
        exam_deadline=datetime(2026, 11, 1, tzinfo=UTC),
        max_session_minutes=60,
        daily_cap_minutes=120,
        now=datetime(2026, 10, 10, tzinfo=UTC),
    )

    assert ranked.activity == "recovery_revision"
    assert ranked.priority > 0.1
    assert "revision first, then questions" in ranked.reason
    assert scheduled.tasks[0].activity == "recovery_revision"
    assert scheduled.tasks[0].reason == ranked.reason
