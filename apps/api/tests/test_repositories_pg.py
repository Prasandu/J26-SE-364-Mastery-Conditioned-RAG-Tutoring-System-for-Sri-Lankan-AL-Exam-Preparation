"""SEC-004 / LAB-018: PostgreSQL session persistence has the in-memory contract and
survives a restart. Runs on a disposable PostgreSQL (LAB_TEST_PG_URL) migrated with the
real supabase/migrations SQL on a fresh database; skipped without it."""

from __future__ import annotations

import os
import secrets
import sys
import threading
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest

from app.repositories import (
    ConflictError,
    ExperimentRecord,
    ReportCacheKey,
    SessionRecord,
    StoredEvent,
)

PG_URL = os.environ.get("LAB_TEST_PG_URL")
pytestmark = pytest.mark.skipif(not PG_URL, reason="LAB_TEST_PG_URL (disposable Postgres) not set")

ROOT = Path(__file__).resolve().parents[3]
USER_A = "00000000-0000-4000-8000-00000000000a"
USER_B = "00000000-0000-4000-8000-00000000000b"
NOW = datetime(2026, 11, 27, 6, 0, tzinfo=UTC)
EXPERIMENTS = [
    ExperimentRecord(
        "exp04_standard_solution", 4, "exp04.title", "1.0.0", "1.0.0", True, {"d": 1}, {"a": 1}
    ),
]


@pytest.fixture(scope="module")
def dsn() -> Iterator[str]:
    import psycopg
    from psycopg.conninfo import make_conninfo

    sys.path.insert(0, str(ROOT / "scripts" / "db"))
    from migration_smoke import MOCK_SUPABASE  # type: ignore[import-not-found]

    assert PG_URL is not None
    admin_url: str = PG_URL
    name = f"lab_repo_{secrets.token_hex(4)}"  # a fresh database, dropped afterwards
    with psycopg.connect(admin_url, autocommit=True) as admin:
        admin.execute(f"create database {name}")
    url = make_conninfo(admin_url, dbname=name)
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(MOCK_SUPABASE)
        for path in sorted((ROOT / "supabase" / "migrations").glob("*.sql")):
            conn.execute(path.read_text(encoding="utf-8"))
    yield url
    with psycopg.connect(admin_url, autocommit=True) as admin:
        admin.execute(f"drop database {name} with (force)")


@pytest.fixture
def store(dsn: str) -> Iterator[Any]:
    from psycopg_pool import ConnectionPool

    from app.repositories_pg import PostgresLabStore

    pool = ConnectionPool(dsn, min_size=1, max_size=4, kwargs={"autocommit": False}, open=True)
    with pool.connection() as conn, conn.transaction():
        conn.execute("truncate public.notebooks, public.reports cascade")
        conn.execute("alter table public.action_events disable trigger action_events_no_truncate")
        conn.execute("truncate public.action_events, public.sessions cascade")
        conn.execute("alter table public.action_events enable trigger action_events_no_truncate")
    yield PostgresLabStore(pool, EXPERIMENTS)
    pool.close()


def session(owner: str = USER_A, **overrides: Any) -> SessionRecord:
    values: dict[str, Any] = {
        "session_id": uuid4(),
        "owner_id": owner,
        "experiment_id": "exp04_standard_solution",
        "definition_version": "1.0.0",
        "assessment_version": "1.0.0",
        "mode": "guided",
        "guidance_level": "beginner",
        "locale": "si",
        "seed": 42,
        "started_on": "2026-11-27",
        "created_at": NOW,
        "prelab": {"answers": ["x"]},
        "status": "active",
        "next_sequence": 0,
        "head_fingerprint": "f0",
    }
    values.update(overrides)
    return SessionRecord(**values)


def event(record: SessionRecord, sequence: int, client: UUID | None = None) -> StoredEvent:
    return StoredEvent(
        session_id=record.session_id,
        sequence=sequence,
        client_action_id=client or uuid4(),
        payload_sha256="b" * 64,
        event={"seq": sequence, "accepted": True},
        response={"ok": True},
        created_at=NOW,
    )


def test_a_session_round_trips_and_belongs_only_to_its_owner(store: Any) -> None:
    record = session()
    store.create(record)

    loaded = store.get(record.session_id, USER_A)

    assert loaded == record
    assert store.get(record.session_id, USER_B) is None
    assert store.get(record.session_id, "dev-student") is None


def test_owners_must_be_supabase_ids_and_sessions_are_unique(store: Any) -> None:
    from app.repositories_pg import OwnerIdError

    with pytest.raises(OwnerIdError):
        store.create(session(owner="dev-student"))
    record = session()
    store.create(record)
    with pytest.raises(ConflictError, match="session_exists"):
        store.create(record)


def test_actions_commit_in_sequence_once_per_client_id(store: Any) -> None:
    record = session()
    store.create(record)
    first = event(record, 0)

    updated = store.commit_action(first, "f1", "active")

    assert (updated.next_sequence, updated.head_fingerprint) == (1, "f1")
    with pytest.raises(ConflictError) as wrong_sequence:
        store.commit_action(event(record, 0), "f2", "active")
    assert (wrong_sequence.value.reason, wrong_sequence.value.current) == ("sequence", 1)
    with pytest.raises(ConflictError, match="client_action_id"):
        store.commit_action(event(record, 1, client=first.client_action_id), "f2", "active")
    store.commit_action(event(record, 1), "f2", "submitted")
    assert [e.sequence for e in store.list(record.session_id)] == [0, 1]
    assert store.find_by_client_action(record.session_id, first.client_action_id) == first
    loaded = store.get(record.session_id, USER_A)
    assert loaded is not None and loaded.status == "submitted"


def test_the_event_chain_is_append_only(store: Any, dsn: str) -> None:
    import psycopg

    record = session()
    store.create(record)
    store.commit_action(event(record, 0), "f1", "active")

    with (
        psycopg.connect(dsn) as conn,
        pytest.raises(psycopg.errors.InsufficientPrivilege, match="append-only"),
    ):
        conn.execute("update public.action_events set payload_sha256 = %s", ("c" * 64,))


def test_concurrent_commits_of_the_same_step_let_exactly_one_win(store: Any) -> None:
    record = session()
    store.create(record)
    outcomes: list[str] = []

    def commit() -> None:
        try:
            store.commit_action(event(record, 0), "f1", "active")
            outcomes.append("ok")
        except ConflictError as exc:
            outcomes.append(exc.reason)

    threads = [threading.Thread(target=commit) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(outcomes) == ["ok", "sequence", "sequence", "sequence"]
    assert len(store.list(record.session_id)) == 1


def test_notebooks_use_optimistic_versions(store: Any) -> None:
    record = session()
    store.create(record)

    assert store.notebook_save(record.session_id, 0, {"v": 1}, NOW).version == 1
    with pytest.raises(ConflictError) as stale:
        store.notebook_save(record.session_id, 0, {"v": "stale"}, NOW)
    assert stale.value.current == 1
    assert store.notebook_save(record.session_id, 1, {"v": 2}, NOW).version == 2
    saved = store.notebook_get(record.session_id)
    assert saved is not None and saved.document == {"v": 2}


def test_reports_are_cached_per_engine_definition_assessment_and_head(store: Any) -> None:
    record = session()
    store.create(record)
    key = ReportCacheKey(record.session_id, "0.2.0", "1.0.0", "1.0.0", "f0")

    store.report_put(key, {"score": 1})
    store.report_put(key, {"score": "never overwritten"})

    assert store.report_get(key) == {"score": 1}
    assert (
        store.report_get(ReportCacheKey(record.session_id, "0.3.0", "1.0.0", "1.0.0", "f0")) is None
    )


def test_everything_survives_a_restart(store: Any, dsn: str) -> None:
    from psycopg_pool import ConnectionPool

    from app.repositories_pg import PostgresLabStore

    record = session()
    store.create(record)
    store.commit_action(event(record, 0), "f1", "active")
    store.notebook_save(record.session_id, 0, {"kept": True}, NOW)

    fresh_pool = ConnectionPool(
        dsn, min_size=1, max_size=2, kwargs={"autocommit": False}, open=True
    )
    try:
        restarted = PostgresLabStore(
            fresh_pool, EXPERIMENTS
        )  # mirroring the catalog again is a no-op
        reloaded = restarted.get(record.session_id, USER_A)
        assert reloaded is not None and reloaded.next_sequence == 1
        assert [e.sequence for e in restarted.list(record.session_id)] == [0]
        notebook = restarted.notebook_get(record.session_id)
        assert notebook is not None and notebook.document == {"kept": True}
        summary = restarted.owner_summary()
    finally:
        fresh_pool.close()
    assert summary == [
        {"ownerId": USER_A, "sessions": 1, "submitted": 0, "lastStartedOn": "2026-11-27"}
    ]
