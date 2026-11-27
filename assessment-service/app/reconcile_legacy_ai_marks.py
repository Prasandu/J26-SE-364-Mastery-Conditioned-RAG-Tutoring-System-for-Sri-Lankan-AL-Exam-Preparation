"""Apply the legacy AI-marks policy (operator correction 2026-11-27).

  python -m app.reconcile_legacy_ai_marks                       dry run: what would happen
  python -m app.reconcile_legacy_ai_marks --apply               do it (one transaction)
  python -m app.reconcile_legacy_ai_marks --priority-threshold 0.6
  python -m app.reconcile_legacy_ai_marks --revert RUN_ID       undo a run (teacher decisions stay)

Every AI-only decision goes back to teacher review, whatever its confidence; confidence
only sets the review priority. Prints counts only. Back the database up first, and do
not run --apply on real student data without explicit operator approval.
See docs/engineering/LEGACY_AI_MARKS_RECONCILIATION.md.
"""

import argparse
import json
import uuid

from app.db import SessionLocal
from app.services.legacy_ai_policy import DEFAULT_PRIORITY_THRESHOLD, apply_policy, revert_run


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--apply", action="store_true", help="Change the data (default: dry run)")
    parser.add_argument(
        "--priority-threshold",
        "--threshold",
        dest="priority_threshold",
        type=float,
        default=DEFAULT_PRIORITY_THRESHOLD,
        help="Confidence at or below this is reviewed first (it never keeps a mark)",
    )
    parser.add_argument("--revert", type=uuid.UUID, metavar="RUN_ID")
    args = parser.parse_args()

    with SessionLocal() as db:
        if args.revert:
            print(json.dumps({"reverted_entries": revert_run(db, args.revert), "run_id": str(args.revert)}))
            return
        report = apply_policy(db, priority_threshold=args.priority_threshold, apply=args.apply)
        if not args.apply:
            db.rollback()
        print(json.dumps(report.summary(), indent=2))


if __name__ == "__main__":
    main()
