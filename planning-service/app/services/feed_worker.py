"""Deployment-managed C2 -> C3 synchronisation: a worker that runs the finalized-mark pull
on an interval (`python -m scripts.pull_assessment_marks --loop`).

- One run at a time across every replica: a Postgres session advisory lock is taken on
  a dedicated connection for the whole run; a replica that cannot take it skips the
  round. (Each page is additionally applied under a transaction lock - see
  app/adapters/assessment_feed.py - and the consumer is idempotent, so an overlap could
  only re-read, never double-count.)
- Interval with jitter so replicas do not fire together; exponential backoff on
  failure, capped, reset after a success.
- Logs one JSON line per round: counts, the error type and the service's own message
  only - never keys, SQL parameters or student data.
- Stops promptly on SIGTERM/SIGINT (the wait is interruptible).
"""

from __future__ import annotations

import json
import random
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.errors import PlanningError

RUN_LOCK_KEY = 0x4A32_3600_1001  # distinct from the per-page transaction lock


@dataclass(frozen=True)
class WorkerConfig:
    interval_seconds: float = 300.0
    jitter_seconds: float = 30.0
    max_backoff_seconds: float = 3600.0


def next_delay(config: WorkerConfig, failures: int, jitter: float) -> float:
    """Seconds until the next round: interval + jitter, or a capped backoff after failures."""
    if failures:
        return min(config.interval_seconds * 2**failures, config.max_backoff_seconds)
    return config.interval_seconds + config.jitter_seconds * jitter


class RunLock:
    """A Postgres session advisory lock held on its own autocommit connection."""

    def __init__(self, engine: Engine, key: int = RUN_LOCK_KEY) -> None:
        self._engine = engine
        self._key = key
        self._connection = None

    def acquire(self) -> bool:
        if self._engine.dialect.name != "postgresql":
            return True
        self._connection = self._engine.connect().execution_options(isolation_level="AUTOCOMMIT")
        acquired = bool(
            self._connection.execute(text("SELECT pg_try_advisory_lock(:key)"), {"key": self._key}).scalar()
        )
        if not acquired:
            self.release()
        return acquired

    def release(self) -> None:
        if self._connection is None:
            return
        try:
            self._connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": self._key})
        finally:
            self._connection.close()
            self._connection = None


def run_round(run_once: Callable[[], Any], lock: RunLock) -> dict[str, Any]:
    """One guarded round. Returns a log record; raises nothing it can describe safely."""
    if not lock.acquire():
        return {"ok": True, "skipped": "another replica is pulling"}
    try:
        report = run_once()
        counts = report.model_dump(mode="json") if hasattr(report, "model_dump") else {}
        return {"ok": True, "report": counts}
    finally:
        lock.release()


def run_worker(
    run_once: Callable[[], Any],
    lock: RunLock,
    *,
    config: WorkerConfig,
    stop: threading.Event,
    wait: Callable[[float], bool] | None = None,
    log: Callable[[str], None] = print,
    jitter: Callable[[], float] = random.random,
    max_rounds: int | None = None,
) -> int:
    """Run rounds until `stop` is set (or `max_rounds`). Returns the rounds run."""
    wait = wait or stop.wait
    failures = 0
    rounds = 0
    while not stop.is_set() and (max_rounds is None or rounds < max_rounds):
        started = datetime.now(UTC).isoformat()
        try:
            record = run_round(run_once, lock)
            failures = 0
        except PlanningError as exc:
            failures += 1
            record = {"ok": False, "error": type(exc).__name__, "message": exc.message}
        except Exception as exc:  # noqa: BLE001 - keep the worker alive, log the type only
            failures += 1
            record = {"ok": False, "error": type(exc).__name__}
        rounds += 1
        delay = next_delay(config, failures, jitter())
        log(
            json.dumps(
                {"event": "assessment_feed_round", "at": started, "next_in_s": round(delay, 1), **record}
            )
        )
        if max_rounds is not None and rounds >= max_rounds:
            break
        if wait(delay):
            break
    return rounds
