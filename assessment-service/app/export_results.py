"""Export marked attempts as CSV, for the evaluation chapter.

  python -m app.export_results                    write into results/
  python -m app.export_results --paper 4          one paper only
  python -m app.export_results --out analysis     a different folder

Writes three files:
  points.csv    one row per marking point decision (the raw data)
  attempts.csv  one row per script
  summary.csv   agreement between the markers, overall and blind only

The summary is also printed, so the headline numbers are visible straight away.
"""

import argparse
import sys
from pathlib import Path

from app.db import SessionLocal
from app.services.export import (
    ATTEMPT_COLUMNS,
    POINT_COLUMNS,
    SUMMARY_COLUMNS,
    attempt_rows,
    comparisons,
    point_rows,
    summary_rows,
    to_csv,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--paper", type=int, help="Only this paper (default: every paper)")
    parser.add_argument("--out", type=Path, default=Path("results"), help="Folder to write into")
    args = parser.parse_args()

    with SessionLocal() as db:
        files = {
            "points.csv": to_csv(POINT_COLUMNS, point_rows(db, args.paper)),
            "attempts.csv": to_csv(ATTEMPT_COLUMNS, attempt_rows(db, args.paper)),
            "summary.csv": to_csv(SUMMARY_COLUMNS, summary_rows(db, args.paper)),
        }
        totals = comparisons(db, args.paper)

    try:
        args.out.mkdir(parents=True, exist_ok=True)
        for name, text in files.items():
            # utf-8-sig so Excel opens the file with the right characters.
            (args.out / name).write_text(text, encoding="utf-8-sig")
    except OSError as error:
        sys.exit(f"Could not write into {args.out}: {error}")

    _report(args.out, files, totals)


def _report(out: Path, files: dict[str, str], totals: list) -> None:
    for name, text in files.items():
        rows = max(len(text.splitlines()) - 1, 0)  # not the header
        print(f"{out / name}: {rows} rows")

    print("\nMarker agreement")
    for comparison in totals:
        percent = "-" if comparison.agreement_pct is None else f"{comparison.agreement_pct}%"
        print(f"  {comparison.name:<30} {comparison.scope:<13} {comparison.judged:>4} judged  {percent:>6}")

    if all(c.judged == 0 for c in totals):
        print("\nNothing has been reviewed by a teacher yet, so there is nothing to compare.")


if __name__ == "__main__":
    main()
