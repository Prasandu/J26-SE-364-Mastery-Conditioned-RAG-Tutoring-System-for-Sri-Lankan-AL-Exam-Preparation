from datetime import UTC, datetime
from types import SimpleNamespace

from app.models import LearnerTopicState, Topic
from app.services.mastery import (
    EvidenceObservation,
    compute_error_rate,
    compute_mastery,
    recompute_for,
)


class EvidenceResult:
    def all(self) -> list[SimpleNamespace]:
        return [
            SimpleNamespace(
                score=8,
                max_score=10,
                difficulty=0.5,
                confidence=0.7,
                observed_at=datetime(2026, 10, 1, tzinfo=UTC),
            ),
            SimpleNamespace(
                score=5,
                max_score=10,
                difficulty=0.5,
                confidence=0.7,
                observed_at=datetime(2026, 10, 2, tzinfo=UTC),
            ),
        ]


class FakeSession:
    def __init__(self) -> None:
        self.added: list[object] = []

    def scalars(self, statement: object) -> EvidenceResult:
        return EvidenceResult()

    def get(self, model: type, key: tuple[str, str]) -> None:
        if model is Topic:
            return SimpleNamespace(exam_weight=0.5)
        assert model is LearnerTopicState
        assert key == ("student-1", "chem-u1")
        return None

    def add(self, record: object) -> None:
        self.added.append(record)


def test_recompute_creates_basic_topic_summary_from_evidence() -> None:
    session = FakeSession()

    as_of = datetime(2026, 10, 3, tzinfo=UTC)
    evidence = [
        EvidenceObservation(
            score=8,
            max_score=10,
            difficulty=0.5,
            confidence=0.7,
            observed_at=datetime(2026, 10, 1, tzinfo=UTC),
        ),
        EvidenceObservation(
            score=5,
            max_score=10,
            difficulty=0.5,
            confidence=0.7,
            observed_at=datetime(2026, 10, 2, tzinfo=UTC),
        ),
    ]

    recompute_for(session, "student-1", ["chem-u1"], as_of=as_of)

    state = session.added[0]
    assert isinstance(state, LearnerTopicState)
    assert state.mastery == compute_mastery(evidence, as_of=as_of)
    assert state.error_rate == compute_error_rate(evidence, as_of=as_of)
    assert state.last_revised == datetime(2026, 10, 2, tzinfo=UTC)
    assert state.trend < 0
    assert 0 <= state.weak_score <= 1
