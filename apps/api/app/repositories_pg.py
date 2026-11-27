"""PostgreSQL persistence for lab sessions (SEC-004 / LAB-018): sessions, the append-only
action-event chain, notebooks and the report cache survive a restart.

Same contract as ``InMemoryRepositories`` (app/repositories.py), on the tables of
supabase/migrations/20261010000100_core_schema.sql (+ 0200 report-cache versions):

- Ownership is part of every session lookup: another owner's session does not exist.
- ``commit_action`` is one transaction: the session row is locked, the sequence must be
  the next one, the event is inserted (unique sequence and client action id; UPDATE and
  DELETE on ``action_events`` are rejected by triggers) and the head advances.
- Notebooks use optimistic versions; reports are cached per (engine, definition,
  assessment, head) and never overwritten.
- Owners are Supabase user ids (uuid) - the ``supabase_jwt`` principal. Settings refuse
  ``LAB_REPOSITORY=postgres`` with the development principal.
- Experiment definitions still come from the versioned content files; each loaded
  version is mirrored into ``public.experiments`` (insert-only per version) so sessions
  can reference it.

The service connects as the table owner (RLS in the schema guards the REST API).
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime
from functools import lru_cache
from typing import Any
from uuid import UUID

from app.repositories import (
    ConflictError,
    ExperimentRecord,
    InMemoryExperiments,
    NotebookRecord,
    ReportCacheKey,
    Repositories,
    SessionRecord,
    StoredEvent,
)

SESSION_SELECT = (
    "select s.id, s.owner_id, e.experiment_key, s.definition_version, s.assessment_version, s.mode,"
    " s.guidance_level, s.locale, s.seed, s.started_on, s.created_at, s.prelab, s.status,"
    " s.next_sequence, s.head_fingerprint"
    " from public.sessions s join public.experiments e on e.id = s.experiment_id"
)
EVENT_SELECT = (
    "select session_id, sequence_number, client_action_id, payload_sha256, event, response,"
    " created_at"
    " from public.action_events"
)


class OwnerIdError(ValueError):
    """PostgreSQL sessions belong to a Supabase user id (uuid)."""


def owner_uuid(owner_id: str) -> str | None:
    try:
        return str(UUID(str(owner_id)))
    except ValueError:
        return None


@lru_cache(maxsize=4)
def _pool(dsn: str) -> Any:
    from psycopg_pool import ConnectionPool

    pool = ConnectionPool(
        dsn,
        min_size=1,
        max_size=10,
        timeout=10,
        max_idle=300,
        kwargs={"autocommit": False, "connect_timeout": 10},
        open=False,
    )
    pool.open(wait=False)
    return pool


def _session(row: tuple[Any, ...]) -> SessionRecord:
    return SessionRecord(
        session_id=row[0],
        owner_id=str(row[1]),
        experiment_id=row[2],
        definition_version=row[3],
        assessment_version=row[4],
        mode=row[5],
        guidance_level=row[6],
        locale=row[7],
        seed=int(row[8]),
        started_on=row[9].isoformat() if isinstance(row[9], date) else str(row[9]),
        created_at=row[10],
        prelab=row[11],
        status=row[12],
        next_sequence=row[13],
        head_fingerprint=row[14],
    )


def _event(row: tuple[Any, ...]) -> StoredEvent:
    return StoredEvent(
        session_id=row[0],
        sequence=row[1],
        client_action_id=row[2],
        payload_sha256=row[3],
        event=row[4],
        response=row[5],
        created_at=row[6],
    )


class PostgresLabStore:
    """Sessions, events, notebooks and reports in PostgreSQL (see module docstring)."""

    def __init__(self, pool: Any, experiments: list[ExperimentRecord]) -> None:
        self._pool = pool
        self._experiment_ids: dict[tuple[str, str, str], str] = {}
        self._mirror_experiments(experiments)

    @contextmanager
    def _tx(self) -> Iterator[Any]:
        with self._pool.connection() as conn, conn.transaction():
            yield conn

    def _mirror_experiments(self, records: list[ExperimentRecord]) -> None:
        from psycopg.types.json import Jsonb

        with self._tx() as conn:
            for r in records:
                row = conn.execute(
                    "insert into public.experiments (experiment_key, experiment_number,"
                    " definition_version,"
                    " assessment_version, active, definition, assessment) values (%s, %s, %s, %s,"
                    " %s, %s, %s)"
                    " on conflict (experiment_key, definition_version, assessment_version)"
                    " do update set active = excluded.active returning id",
                    (
                        r.experiment_id,
                        r.experiment_number,
                        r.definition_version,
                        r.assessment_version,
                        r.active,
                        Jsonb(r.definition),
                        Jsonb(r.assessment),
                    ),
                ).fetchone()
                self._experiment_ids[
                    (r.experiment_id, r.definition_version, r.assessment_version)
                ] = str(row[0])

    # -- sessions
    def create(self, record: SessionRecord) -> None:
        import psycopg
        from psycopg.types.json import Jsonb

        owner = owner_uuid(record.owner_id)
        if owner is None:
            raise OwnerIdError("PostgreSQL sessions need a Supabase user id as owner")
        experiment = self._experiment_ids.get(
            (record.experiment_id, record.definition_version, record.assessment_version)
        )
        if experiment is None:
            raise ConflictError("unknown_experiment_version")
        try:
            with self._tx() as conn:
                conn.execute(
                    "insert into public.sessions (id, owner_id, experiment_id, definition_version,"
                    " assessment_version, mode, guidance_level, locale, seed, started_on, prelab,"
                    " status,"
                    " next_sequence, head_fingerprint, created_at)"
                    " values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (
                        record.session_id,
                        owner,
                        experiment,
                        record.definition_version,
                        record.assessment_version,
                        record.mode,
                        record.guidance_level,
                        record.locale,
                        record.seed,
                        date.fromisoformat(record.started_on),
                        Jsonb(record.prelab) if record.prelab is not None else None,
                        record.status,
                        record.next_sequence,
                        record.head_fingerprint,
                        record.created_at,
                    ),
                )
        except psycopg.errors.UniqueViolation as exc:
            raise ConflictError("session_exists") from exc

    def get(self, session_id: UUID, owner_id: str) -> SessionRecord | None:
        owner = owner_uuid(owner_id)
        if owner is None:
            return None
        with self._tx() as conn:
            row = conn.execute(
                SESSION_SELECT + " where s.id = %s and s.owner_id = %s", (session_id, owner)
            ).fetchone()
        return _session(row) if row else None

    def owner_summary(self) -> list[dict[str, Any]]:
        with self._tx() as conn:
            rows = conn.execute(
                "select owner_id, count(*), count(*) filter (where status = 'submitted'),"
                " max(started_on)"
                " from public.sessions group by owner_id order by owner_id::text"
            ).fetchall()
        return [
            {
                "ownerId": str(owner),
                "sessions": sessions,
                "submitted": submitted,
                "lastStartedOn": last.isoformat() if last else "",
            }
            for owner, sessions, submitted, last in rows
        ]

    # -- events
    def list(self, session_id: UUID) -> list[StoredEvent]:
        with self._tx() as conn:
            rows = conn.execute(
                EVENT_SELECT + " where session_id = %s order by sequence_number", (session_id,)
            ).fetchall()
        return [_event(row) for row in rows]

    def find_by_client_action(self, session_id: UUID, client_action_id: UUID) -> StoredEvent | None:
        with self._tx() as conn:
            row = conn.execute(
                EVENT_SELECT + " where session_id = %s and client_action_id = %s",
                (session_id, client_action_id),
            ).fetchone()
        return _event(row) if row else None

    def commit_action(
        self, event: StoredEvent, head_fingerprint: str, status: str
    ) -> SessionRecord:
        import psycopg
        from psycopg.types.json import Jsonb

        try:
            with self._tx() as conn:
                row = conn.execute(
                    "select owner_id, next_sequence, head_fingerprint from public.sessions where"
                    " id = %s for update",
                    (event.session_id,),
                ).fetchone()
                if row is None:
                    raise ConflictError("session_missing")
                owner, next_sequence, before = row
                if event.sequence != next_sequence:
                    raise ConflictError("sequence", next_sequence)
                conn.execute(
                    "insert into public.action_events (session_id, owner_id, sequence_number,"
                    " client_action_id,"
                    " payload_sha256, accepted, fingerprint_before, fingerprint_after, event,"
                    " response, created_at)"
                    " values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (
                        event.session_id,
                        owner,
                        event.sequence,
                        event.client_action_id,
                        event.payload_sha256,
                        bool(event.event.get("accepted", True)),
                        before,
                        head_fingerprint,
                        Jsonb(event.event),
                        Jsonb(event.response),
                        event.created_at,
                    ),
                )
                conn.execute(
                    "update public.sessions set next_sequence = next_sequence + 1,"
                    " head_fingerprint = %s,"
                    " status = %s where id = %s",
                    (head_fingerprint, status, event.session_id),
                )
                updated = conn.execute(
                    SESSION_SELECT + " where s.id = %s", (event.session_id,)
                ).fetchone()
        except psycopg.errors.UniqueViolation as exc:
            constraint = getattr(exc.diag, "constraint_name", "") or ""
            raise ConflictError(
                "client_action_id" if "idempotency" in constraint else "sequence"
            ) from exc
        return _session(updated)

    # -- notebooks
    def notebook_get(self, session_id: UUID) -> NotebookRecord | None:
        with self._tx() as conn:
            row = conn.execute(
                "select version, document, updated_at from public.notebooks where session_id = %s",
                (session_id,),
            ).fetchone()
        return NotebookRecord(session_id, row[0], row[1], row[2]) if row else None

    def notebook_save(
        self, session_id: UUID, expected_version: int, document: dict[str, Any], now: datetime
    ) -> NotebookRecord:
        from psycopg.types.json import Jsonb

        with self._tx() as conn:
            if expected_version == 0:
                row = conn.execute(
                    "insert into public.notebooks (session_id, owner_id, version, document)"
                    " select id, owner_id, 1, %s from public.sessions where id = %s"
                    " on conflict (session_id) do nothing returning version",
                    (Jsonb(document), session_id),
                ).fetchone()
            else:
                row = conn.execute(
                    "update public.notebooks set version = version + 1, document = %s"
                    " where session_id = %s and version = %s returning version",
                    (Jsonb(document), session_id, expected_version),
                ).fetchone()
            if row is None:
                current = conn.execute(
                    "select version from public.notebooks where session_id = %s", (session_id,)
                ).fetchone()
                raise ConflictError("notebook_version", current[0] if current else 0)
        return NotebookRecord(session_id, row[0], document, now)

    # -- reports
    def report_get(self, key: ReportCacheKey) -> dict[str, Any] | None:
        with self._tx() as conn:
            row = conn.execute(
                "select report from public.reports where session_id = %s and engine_version = %s"
                " and definition_version = %s and assessment_version = %s and head_fingerprint ="
                " %s",
                (
                    key.session_id,
                    key.engine_version,
                    key.definition_version,
                    key.assessment_version,
                    key.head_fingerprint,
                ),
            ).fetchone()
        return row[0] if row else None

    def report_put(self, key: ReportCacheKey, report: dict[str, Any]) -> None:
        from psycopg.types.json import Jsonb

        with self._tx() as conn:
            conn.execute(
                "insert into public.reports (session_id, owner_id, head_fingerprint,"
                " assessment_version,"
                " engine_version, definition_version, report)"
                " select id, owner_id, %s, %s, %s, %s, %s from public.sessions where id = %s"
                " on conflict on constraint reports_version_head_unique do nothing",
                (
                    key.head_fingerprint,
                    key.assessment_version,
                    key.engine_version,
                    key.definition_version,
                    Jsonb(report),
                    key.session_id,
                ),
            )


class _Notebooks:
    def __init__(self, store: PostgresLabStore) -> None:
        self._store = store

    def get(self, session_id: UUID) -> NotebookRecord | None:
        return self._store.notebook_get(session_id)

    def save(
        self, session_id: UUID, expected_version: int, document: dict[str, Any], now: datetime
    ) -> NotebookRecord:
        return self._store.notebook_save(session_id, expected_version, document, now)


class _Reports:
    def __init__(self, store: PostgresLabStore) -> None:
        self._store = store

    def get(self, key: ReportCacheKey) -> dict[str, Any] | None:
        return self._store.report_get(key)

    def put(self, key: ReportCacheKey, report: dict[str, Any]) -> None:
        self._store.report_put(key, report)


def postgres_repositories(
    experiments: list[ExperimentRecord], dsn: str | None = None, pool: Any = None
) -> tuple[Repositories, PostgresLabStore]:
    store = PostgresLabStore(pool if pool is not None else _pool(dsn), experiments)
    repos = Repositories(
        experiments=InMemoryExperiments(experiments),
        sessions=store,
        events=store,
        notebooks=_Notebooks(store),
        reports=_Reports(store),
    )
    return repos, store
