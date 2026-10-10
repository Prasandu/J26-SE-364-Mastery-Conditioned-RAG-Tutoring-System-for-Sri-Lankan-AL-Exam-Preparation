"""Persistence boundary.

Protocols describe what routes and services need; ``InMemoryRepositories`` is a complete
development/test adapter. **Data disappears when the process stops** — it is not production
persistence. A PostgreSQL adapter (see supabase/migrations) can implement the same protocols;
``commit_action`` maps to a single transaction there.
"""

import copy
import threading
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Any, Protocol
from uuid import UUID


class ConflictError(Exception):
    """A uniqueness or version constraint was violated."""

    def __init__(self, reason: str, current: int | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.current = current


@dataclass(frozen=True)
class ExperimentRecord:
    experiment_id: str
    experiment_number: int
    title_key: str
    definition_version: str
    assessment_version: str
    active: bool
    definition: dict[str, Any]
    assessment: dict[str, Any]


@dataclass(frozen=True)
class SessionRecord:
    session_id: UUID
    owner_id: str
    experiment_id: str
    definition_version: str
    assessment_version: str
    mode: str
    guidance_level: str | None
    locale: str
    seed: int
    started_on: str
    created_at: datetime
    prelab: dict[str, Any] | None
    status: str
    next_sequence: int
    head_fingerprint: str

    def init(self) -> dict[str, Any]:
        """SessionInit for the verifier, rebuilt from canonical server-side fields only."""
        return {
            "sessionId": str(self.session_id),
            "mode": self.mode,
            "guidanceLevel": self.guidance_level,
            "seed": self.seed,
            "startedOn": self.started_on,
        }


@dataclass(frozen=True)
class StoredEvent:
    session_id: UUID
    sequence: int
    client_action_id: UUID
    payload_sha256: str
    event: dict[str, Any]
    response: dict[str, Any]
    created_at: datetime


@dataclass(frozen=True)
class NotebookRecord:
    session_id: UUID
    version: int
    document: dict[str, Any]
    updated_at: datetime


class ExperimentRepository(Protocol):
    def list(self) -> list[ExperimentRecord]: ...
    def get(self, experiment_id: str) -> ExperimentRecord | None: ...


class SessionRepository(Protocol):
    def create(self, record: SessionRecord) -> None: ...
    def get(self, session_id: UUID, owner_id: str) -> SessionRecord | None: ...


class EventRepository(Protocol):
    def list(self, session_id: UUID) -> list[StoredEvent]: ...
    def find_by_client_action(
        self, session_id: UUID, client_action_id: UUID
    ) -> StoredEvent | None: ...
    def commit_action(
        self, event: StoredEvent, head_fingerprint: str, status: str
    ) -> SessionRecord: ...


class NotebookRepository(Protocol):
    def get(self, session_id: UUID) -> NotebookRecord | None: ...
    def save(
        self, session_id: UUID, expected_version: int, document: dict[str, Any], now: datetime
    ) -> NotebookRecord: ...


@dataclass(frozen=True)
class ReportCacheKey:
    """A cached report is valid only for this exact engine, rules, scoring and event chain."""

    session_id: UUID
    engine_version: str
    definition_version: str
    assessment_version: str
    head_fingerprint: str


class ReportRepository(Protocol):
    def get(self, key: ReportCacheKey) -> dict[str, Any] | None: ...
    def put(self, key: ReportCacheKey, report: dict[str, Any]) -> None: ...


class InMemoryExperiments:
    def __init__(self, records: list[ExperimentRecord]) -> None:
        self._records = {r.experiment_id: r for r in records}

    def list(self) -> list[ExperimentRecord]:
        return [copy.deepcopy(self._records[k]) for k in sorted(self._records)]

    def get(self, experiment_id: str) -> ExperimentRecord | None:
        record = self._records.get(experiment_id)
        return copy.deepcopy(record) if record else None


class InMemoryRepositories:
    """Sessions, events (with idempotency), notebooks and reports behind one lock."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._sessions: dict[UUID, SessionRecord] = {}
        self._events: dict[UUID, list[StoredEvent]] = {}
        self._by_client: dict[tuple[UUID, UUID], StoredEvent] = {}
        self._notebooks: dict[UUID, NotebookRecord] = {}
        self._reports: dict[ReportCacheKey, dict[str, Any]] = {}

    def reset(self) -> None:
        with self._lock:
            self.__init__()  # type: ignore[misc]

    # -- sessions
    def create(self, record: SessionRecord) -> None:
        with self._lock:
            if record.session_id in self._sessions:
                raise ConflictError("session_exists")
            self._sessions[record.session_id] = copy.deepcopy(record)
            self._events[record.session_id] = []

    def get(self, session_id: UUID, owner_id: str) -> SessionRecord | None:
        with self._lock:
            record = self._sessions.get(session_id)
            # Ownership is part of the lookup: another principal's session simply does not exist.
            return copy.deepcopy(record) if record and record.owner_id == owner_id else None

    # -- events
    def list(self, session_id: UUID) -> list[StoredEvent]:
        with self._lock:
            return copy.deepcopy(self._events.get(session_id, []))

    def find_by_client_action(self, session_id: UUID, client_action_id: UUID) -> StoredEvent | None:
        with self._lock:
            found = self._by_client.get((session_id, client_action_id))
            return copy.deepcopy(found) if found else None

    def commit_action(
        self, event: StoredEvent, head_fingerprint: str, status: str
    ) -> SessionRecord:
        """Append one event and advance the session atomically (unique sequence + client ID)."""
        with self._lock:
            session = self._sessions[event.session_id]
            events = self._events[event.session_id]
            if event.sequence != session.next_sequence or event.sequence != len(events):
                raise ConflictError("sequence", session.next_sequence)
            key = (event.session_id, event.client_action_id)
            if key in self._by_client:
                raise ConflictError("client_action_id")
            stored = copy.deepcopy(event)
            events.append(stored)
            self._by_client[key] = stored
            updated = replace(
                session,
                next_sequence=session.next_sequence + 1,
                head_fingerprint=head_fingerprint,
                status=status,
            )
            self._sessions[event.session_id] = updated
            return copy.deepcopy(updated)

    # -- notebooks (``get``/``save`` names are distinct from sessions via the adapters below)
    def notebook_get(self, session_id: UUID) -> NotebookRecord | None:
        with self._lock:
            record = self._notebooks.get(session_id)
            return copy.deepcopy(record) if record else None

    def notebook_save(
        self, session_id: UUID, expected_version: int, document: dict[str, Any], now: datetime
    ) -> NotebookRecord:
        with self._lock:
            current = self._notebooks.get(session_id)
            current_version = current.version if current else 0
            if expected_version != current_version:
                raise ConflictError("notebook_version", current_version)
            record = NotebookRecord(session_id, current_version + 1, copy.deepcopy(document), now)
            self._notebooks[session_id] = record
            return copy.deepcopy(record)

    # -- reports
    def report_get(self, key: ReportCacheKey) -> dict[str, Any] | None:
        with self._lock:
            report = self._reports.get(key)
            return copy.deepcopy(report) if report else None

    def report_put(self, key: ReportCacheKey, report: dict[str, Any]) -> None:
        with self._lock:
            self._reports[key] = copy.deepcopy(report)


class _NotebookAdapter:
    def __init__(self, store: InMemoryRepositories) -> None:
        self._store = store

    def get(self, session_id: UUID) -> NotebookRecord | None:
        return self._store.notebook_get(session_id)

    def save(
        self, session_id: UUID, expected_version: int, document: dict[str, Any], now: datetime
    ) -> NotebookRecord:
        return self._store.notebook_save(session_id, expected_version, document, now)


class _ReportAdapter:
    def __init__(self, store: InMemoryRepositories) -> None:
        self._store = store

    def get(self, key: ReportCacheKey) -> dict[str, Any] | None:
        return self._store.report_get(key)

    def put(self, key: ReportCacheKey, report: dict[str, Any]) -> None:
        self._store.report_put(key, report)


@dataclass(frozen=True)
class Repositories:
    experiments: ExperimentRepository
    sessions: SessionRepository
    events: EventRepository
    notebooks: NotebookRepository
    reports: ReportRepository


def in_memory_repositories(
    experiments: list[ExperimentRecord],
) -> tuple[Repositories, InMemoryRepositories]:
    store = InMemoryRepositories()
    repos = Repositories(
        experiments=InMemoryExperiments(experiments),
        sessions=store,
        events=store,
        notebooks=_NotebookAdapter(store),
        reports=_ReportAdapter(store),
    )
    return repos, store
