"""Create a draft paper in the database from imported pages.

  python -m app.load_draft drafts/2024_plan.json

The plan file says how the imported pages map onto sections:

  {
    "title": "G.C.E. (A/L) Chemistry 2024",
    "kind": "past",
    "year": 2024,
    "sections": [
      {"code": "I", "title": "Paper I - Multiple choice", "answer_mode": "mcq",
       "marks_each": 1, "drafts": ["2024_p1.json", "2024_p2.json"]}
    ]
  }

The paper is created as a draft. Check it, add its marking scheme, then publish.
"""

import argparse
import sys
from pathlib import Path

from pydantic import ValidationError

from app.db import SessionLocal
from app.errors import DomainError
from app.services.drafts import build_paper, load_plan
from app.services.papers import create_paper


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("plan", type=Path, help="The plan file described above")
    parser.add_argument("--dry-run", action="store_true", help="Check it without saving")
    args = parser.parse_args()

    if not args.plan.is_file():
        sys.exit(f"No such file: {args.plan}")

    try:
        body = build_paper(load_plan(args.plan))
    except (ValidationError, ValueError, OSError) as error:
        sys.exit(f"The plan or its drafts could not be read:\n{error}")

    for section in body.sections:
        print(f"  {section.code}: {len(section.questions)} questions ({section.answer_mode})")

    if args.dry_run:
        print("\nDry run, nothing saved.")
        return

    with SessionLocal() as db:
        try:
            paper = create_paper(db, body)
        except DomainError as error:
            sys.exit(f"\n{error.message}\n" + "\n".join(f"  - {problem}" for problem in error.errors))

    print(f"\nCreated draft paper id={paper.id}: {paper.title}")
    print("Next: add its marking scheme, then publish both.")


if __name__ == "__main__":
    main()
