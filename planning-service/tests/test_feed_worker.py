"""C2 -> C3 synchronisation worker (no database): interval, jitter, capped backoff,
prompt stop, and logs that carry counts and error types only."""

import json
import threading

from sqlalchemy import create_engine

from app.errors import UpstreamServiceError
from app.schemas.finalized_marks import PullReport
from app.services.feed_worker import RunLock, WorkerConfig, next_delay, run_worker

CONFIG = WorkerConfig(interval_seconds=300, jitter_seconds=30, max_backoff_seconds=3600)
SECRET = "assessment-key-that-must-never-be-logged"


class Recorder:
    def __init__(self):
        self.lines: list[dict] = []
        self.waits: list[float] = []

    def log(self, line: str) -> None:
        self.lines.append(json.loads(line))

    def wait(self, seconds: float) -> bool:
        self.waits.append(seconds)
        return False


def no_lock() -> RunLock:
    return RunLock(create_engine("sqlite://"))  # not Postgres: always "acquired"


def test_delay_is_interval_plus_jitter_then_capped_backoff():
    assert next_delay(CONFIG, 0, 0.5) == 315
    assert next_delay(CONFIG, 1, 0.9) == 600
    assert next_delay(CONFIG, 3, 0.0) == 2400
    assert next_delay(CONFIG, 10, 0.0) == 3600


def test_rounds_log_counts_and_wait_between_them():
    recorder = Recorder()
    report = PullReport(pages=2, applied=5, duplicates=1)

    rounds = run_worker(
        lambda: report,
        no_lock(),
        config=CONFIG,
        stop=threading.Event(),
        wait=recorder.wait,
        log=recorder.log,
        jitter=lambda: 0.0,
        max_rounds=3,
    )

    assert rounds == 3
    assert [line["report"]["applied"] for line in recorder.lines] == [5, 5, 5]
    assert all(line["ok"] and line["event"] == "assessment_feed_round" for line in recorder.lines)
    assert recorder.waits == [300, 300]  # no wait after the last round


def test_failures_back_off_and_a_success_resets_without_logging_secrets():
    recorder = Recorder()
    outcomes = iter(
        [
            UpstreamServiceError("Assessment service returned HTTP 503."),
            RuntimeError(f"connection to postgres://user:{SECRET}@host failed"),
            PullReport(applied=1),
        ]
    )

    def run_once():
        outcome = next(outcomes)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    run_worker(
        run_once,
        no_lock(),
        config=CONFIG,
        stop=threading.Event(),
        wait=recorder.wait,
        log=recorder.log,
        jitter=lambda: 0.0,
        max_rounds=3,
    )

    assert recorder.waits == [600, 1200]
    assert recorder.lines[0] == {**recorder.lines[0], "ok": False, "error": "UpstreamServiceError"}
    assert recorder.lines[0]["message"] == "Assessment service returned HTTP 503."
    assert recorder.lines[1]["error"] == "RuntimeError" and "message" not in recorder.lines[1]
    assert recorder.lines[2]["ok"] is True
    assert SECRET not in json.dumps(recorder.lines)


def test_a_stop_signal_ends_the_worker_promptly():
    stop = threading.Event()
    calls = []

    def run_once():
        calls.append(1)
        stop.set()  # e.g. SIGTERM arrived during the round
        return PullReport()

    rounds = run_worker(run_once, no_lock(), config=CONFIG, stop=stop, log=lambda line: None)

    assert rounds == 1 and calls == [1]
