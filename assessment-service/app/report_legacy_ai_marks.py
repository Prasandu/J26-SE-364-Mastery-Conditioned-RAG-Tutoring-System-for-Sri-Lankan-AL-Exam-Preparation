"""Report attempts whose stored score still includes AI-judged marks (pre GRD-011).

  python -m app.report_legacy_ai_marks            CSV on stdout
  python -m app.report_legacy_ai_marks --summary  totals only

Read-only: the session is rolled back, nothing is written. Students appear only as
pseudonyms. See docs/engineering/LEGACY_AI_MARKS_RECONCILIATION.md for the options; none
is applied without an explicit operator decision.
"""

import argparse
import csv
import sys
from dataclasses import asdict, fields

from app.db import SessionLocal
from app.services.legacy_ai_marks import LegacyAttempt, legacy_ai_attempts


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--summary", action="store_true", help="Totals only")
    args = parser.parse_args()

    with SessionLocal() as db:
        try:
            rows = legacy_ai_attempts(db)
        finally:
            db.rollback()

    if args.summary:
        students = {row.student for row in rows}
        print(
            f"attempts with AI-decided points: {len(rows)}; students: {len(students)}; "
            f"AI-decided points: {sum(r.ai_points for r in rows)}; "
            f"AI-awarded marks (upper bound): {sum(r.ai_awarded_marks for r in rows):g}"
        )
        return
    writer = csv.DictWriter(sys.stdout, fieldnames=[f.name for f in fields(LegacyAttempt)])
    writer.writeheader()
    for row in rows:
        writer.writerow(asdict(row))


if __name__ == "__main__":
    main()
