"""Apply the legacy AI-marks policy (operator decision 2026-11-27).

  python -m app.reconcile_legacy_ai_marks                     dry run: what would happen
  python -m app.reconcile_legacy_ai_marks --apply             do it (one transaction)
  python -m app.reconcile_legacy_ai_marks --threshold 0.6     a different cut-off
  python -m app.reconcile_legacy_ai_marks --revert RUN_ID     undo a run (teacher decisions stay)

AI-decided points with confidence <= threshold (or none) go back to teacher review; the
rest stay, labelled as AI-judged. Prints counts only. Back the database up first.
See docs/engineering/LEGACY_AI_MARKS_RECONCILIATION.md.
"""

import argparse
import json
import uuid

from app.db import SessionLocal
from app.services.legacy_ai_policy import DEFAULT_THRESHOLD, apply_policy, revert_run


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--apply", action="store_true", help="Change the data (default: dry run)")
    parser.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD)
    parser.add_argument("--revert", type=uuid.UUID, metavar="RUN_ID")
    args = parser.parse_args()

    with SessionLocal() as db:
        if args.revert:
            print(json.dumps({"reverted_entries": revert_run(db, args.revert), "run_id": str(args.revert)}))
            return
        report = apply_policy(db, threshold=args.threshold, apply=args.apply)
        if not args.apply:
            db.rollback()
        print(json.dumps(report.summary(), indent=2))


if __name__ == "__main__":
    main()
