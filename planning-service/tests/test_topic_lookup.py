from types import SimpleNamespace
from typing import Any

from app.services.topic_lookup import preload_topics


class CountingSession:
    def __init__(self) -> None:
        self.info: dict[str, Any] = {}
        self.queries = 0

    def scalars(self, _statement: Any) -> SimpleNamespace:
        self.queries += 1
        topics = [SimpleNamespace(id="chem-u1"), SimpleNamespace(id="chem-u2")]
        return SimpleNamespace(all=lambda: topics)


def test_topics_are_loaded_once_per_session_and_kept_alive() -> None:
    session = CountingSession()

    first = preload_topics(session)  # type: ignore[arg-type]
    second = preload_topics(session)  # type: ignore[arg-type]

    assert session.queries == 1
    assert first is second and set(first) == {"chem-u1", "chem-u2"}
    # A strong reference stays on the session so the identity map cannot drop the rows.
    assert session.info["topics_by_id"] is first
