"""Add a marking scheme to an existing paper from imported pages.

  python -m app.load_scheme drafts/2024_scheme_plan.json

The plan file says which paper the scheme belongs to and which pages cover which section:

  {
    "paper_id": 1,
    "source": "official",
    "notes": "Department of Examinations 2024",
    "sections": [
      {"code": "I", "mcq_marks": 1, "drafts": ["2024_key.json"]},
      {"code": "II-A", "drafts": ["2024_schemeA.json"]}
    ]
  }

The scheme is created as a draft version. Check it, then publish it.
"""

import argparse
import sys
from pathlib import Path

from pydantic import ValidationError

from app.db import SessionLocal
from app.errors import DomainError
from app.services.drafts import build_scheme, load_scheme_plan, plan_problems
from app.services.plan_report import warn_about
from app.services.schemes import create_scheme


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("plan", type=Path, help="The plan file described above")
    parser.add_argument("--dry-run", action="store_true", help="Check it without saving")
    parser.add_argument("--force", action="store_true", help="Load even if the drafts look incomplete")
    args = parser.parse_args()

    if not args.plan.is_file():
        sys.exit(f"No such file: {args.plan}")

    try:
        plan = load_scheme_plan(args.plan)
        body = build_scheme(plan)
    except (ValidationError, ValueError, OSError) as error:
        sys.exit(f"The plan or its drafts could not be read:\n{error}")

    warn_about(plan_problems(plan.sections), args.force)

    marks = sum(point.marks for question in body.questions for point in question.points)
    print(f"  {len(body.questions)} marked questions, {marks:g} marks in total")

    if args.dry_run:
        print("\nDry run, nothing saved.")
        return

    with SessionLocal() as db:
        try:
            scheme = create_scheme(db, plan.paper_id, body)
        except DomainError as error:
            sys.exit(f"\n{error.message}\n" + "\n".join(f"  - {problem}" for problem in error.errors))

    print(f"\nCreated draft marking scheme v{scheme.version} for paper {plan.paper_id}")
    print("Next: check it, then publish the scheme and the paper.")


if __name__ == "__main__":
    main()
