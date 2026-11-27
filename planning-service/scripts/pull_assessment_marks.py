"""Pull finalized assessment marks into planner mastery (DAT-010) - for cron / a scheduler.

    python -m scripts.pull_assessment_marks              one pull (up to ASSESSMENT_FEED_MAX_PAGES)
    python -m scripts.pull_assessment_marks --release    also apply quarantined marks that map now
    python -m scripts.pull_assessment_marks --quarantine show unmapped codes, change nothing

Needs ASSESSMENT_SERVICE_URL and ASSESSMENT_SERVICE_API_KEY. Prints counts only. Exit code
1 when the pull failed (the failed page was rolled back; the next run re-reads it).
"""

from __future__ import annotations

import argparse
import json
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--release", action="store_true")
    parser.add_argument("--quarantine", action="store_true")
    args = parser.parse_args(argv)

    from app.adapters.assessment_feed import AssessmentFeedClient, pull_finalized_marks
    from app.config import settings
    from app.db import SessionLocal
    from app.errors import PlanningError
    from app.services.finalized_marks import quarantine_summary, release_quarantined
    from app.services.topic_registry import load_registry

    registry = load_registry()
    with SessionLocal() as session:
        if args.quarantine:
            print(quarantine_summary(session, registry).model_dump_json(indent=2))
            return 0
        try:
            report = pull_finalized_marks(
                session,
                AssessmentFeedClient.from_settings(),
                registry,
                max_pages=settings.assessment_feed_max_pages,
                page_size=settings.assessment_feed_page_size,
            )
        except PlanningError as exc:
            print(json.dumps({"ok": False, "error": exc.message}), file=sys.stderr)
            return 1
        result = {"ok": True, "pull": report.model_dump(mode="json")}
        if args.release:
            released = release_quarantined(session, registry)
            session.commit()
            result["release"] = released.model_dump(mode="json")
        print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
