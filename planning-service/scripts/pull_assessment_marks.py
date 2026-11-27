"""Pull finalized assessment marks into planner mastery (DAT-010).

    python -m scripts.pull_assessment_marks              one pull (up to ASSESSMENT_FEED_MAX_PAGES)
    python -m scripts.pull_assessment_marks --loop       worker: pull every ASSESSMENT_FEED_INTERVAL_SECONDS
    python -m scripts.pull_assessment_marks --release    also apply quarantined marks that map now
    python -m scripts.pull_assessment_marks --quarantine show unmapped codes, change nothing

Needs ASSESSMENT_SERVICE_URL and ASSESSMENT_SERVICE_API_KEY. Prints counts only. One-shot
mode exits 1 when the pull failed (the failed page was rolled back; the next run re-reads
it). Loop mode keeps one run at a time across replicas (Postgres advisory lock), backs off
on failure and stops on SIGTERM/SIGINT. Deployment examples: deploy/assessment-feed/.
"""

from __future__ import annotations

import argparse
import json
import signal
import sys
import threading


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--loop", action="store_true", help="Run as a long-lived worker")
    parser.add_argument("--release", action="store_true")
    parser.add_argument("--quarantine", action="store_true")
    args = parser.parse_args(argv)

    from app.adapters.assessment_feed import AssessmentFeedClient, pull_finalized_marks
    from app.config import settings
    from app.db import SessionLocal, engine
    from app.errors import PlanningError
    from app.services.feed_worker import RunLock, WorkerConfig, run_worker
    from app.services.finalized_marks import quarantine_summary, release_quarantined
    from app.services.topic_registry import load_registry

    registry = load_registry()

    def pull_once():
        with SessionLocal() as session:
            report = pull_finalized_marks(
                session,
                AssessmentFeedClient.from_settings(),
                registry,
                max_pages=settings.assessment_feed_max_pages,
                page_size=settings.assessment_feed_page_size,
            )
            if args.release:
                released = release_quarantined(session, registry)
                session.commit()
                report.released = released.released
            return report

    if args.loop:
        stop = threading.Event()
        for signum in (signal.SIGINT, signal.SIGTERM):
            signal.signal(signum, lambda *_: stop.set())
        config = WorkerConfig(
            interval_seconds=settings.assessment_feed_interval_seconds,
            jitter_seconds=settings.assessment_feed_jitter_seconds,
        )
        run_worker(
            pull_once, RunLock(engine), config=config, stop=stop, log=lambda line: print(line, flush=True)
        )
        return 0

    with SessionLocal() as session:
        if args.quarantine:
            print(quarantine_summary(session, registry).model_dump_json(indent=2))
            return 0
    try:
        report = pull_once()
    except PlanningError as exc:
        print(json.dumps({"ok": False, "error": exc.message}), file=sys.stderr)
        return 1
    print(json.dumps({"ok": True, "pull": report.model_dump(mode="json")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
