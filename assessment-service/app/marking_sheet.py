"""Print the paper marking sheet a teacher fills in by hand.

  python -m app.marking_sheet 1                     the published scheme of paper 1
  python -m app.marking_sheet 1 --version 2         a named scheme version
  python -m app.marking_sheet 1 --student S001      the student's id already filled in
  python -m app.marking_sheet 1 --out sheet.csv     save instead of printing

One row per marking point, so the teacher marks exactly what the system marks and
the two can be compared point by point.
"""

import argparse
import sys
from pathlib import Path

from app.db import SessionLocal
from app.errors import DomainError
from app.models import SchemeStatus
from app.services.marking_sheet import to_csv
from app.services.papers import get_paper
from app.services.schemes import get_scheme, latest_published_scheme


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("paper_id", type=int, help="Which paper")
    parser.add_argument("--version", type=int, help="Scheme version (default: the published one)")
    parser.add_argument("--student", default="", help="Student id to print on the sheet")
    parser.add_argument("--out", type=Path, help="Write to this file instead of the screen")
    args = parser.parse_args()

    with SessionLocal() as db:
        try:
            paper = get_paper(db, args.paper_id)
            scheme = _pick_scheme(db, paper, args.version)
        except DomainError as error:
            sys.exit(error.message)

        if scheme is None:
            sys.exit(f"Paper {args.paper_id} has no published marking scheme. Publish one first.")
        if scheme.status != SchemeStatus.PUBLISHED:
            print(f"Warning: scheme v{scheme.version} is still a draft.", file=sys.stderr)

        text = to_csv(scheme, args.student)

    if args.out:
        try:
            args.out.parent.mkdir(parents=True, exist_ok=True)  # make the folder if it is new
            # utf-8-sig so Excel opens the file with the right characters.
            args.out.write_text(text, encoding="utf-8-sig")
        except OSError as error:
            sys.exit(f"Could not write {args.out}: {error}")
        print(f"Wrote {args.out}")
    else:
        sys.stdout.write(text)


def _pick_scheme(db, paper, version: int | None):
    if version is None:
        return latest_published_scheme(paper)
    return get_scheme(db, paper.id, version)


if __name__ == "__main__":
    main()
