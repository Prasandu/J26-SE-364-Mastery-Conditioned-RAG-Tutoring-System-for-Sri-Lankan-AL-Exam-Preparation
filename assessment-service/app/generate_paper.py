"""Make a model paper from chosen syllabus topics.

  python -m app.generate_paper --topics U01 U03 --mcq 10
  python -m app.generate_paper --topics U12_1 U12_2 --structured 2 --essay 1
  python -m app.generate_paper --topics U01 --mcq 5 --title "Atomic structure practice"
  python -m app.generate_paper --topics U01 --mcq 5 --plan-only

Timing follows the real papers: 50 multiple choice in 2 hours, 4 structured in
1 hour, 4 essays in 2 hours.

The paper and its marking scheme are saved as DRAFTS. An AI wrote the scheme, so read
it and publish it yourself, the same as an imported past paper.
"""

import argparse
import sys

from app.ai import build_author
from app.config import get_settings
from app.db import SessionLocal
from app.errors import DomainError
from app.models import AnswerMode
from app.services.generator.blueprint import build_blueprint, problems
from app.services.generator.build import generate
from app.services.papers import create_paper
from app.services.schemes import create_scheme
from app.services.topics import topics_by_code


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--topics", nargs="+", required=True, help="Topic codes, e.g. U01 U03_2")
    parser.add_argument("--mcq", type=int, default=0, help="How many multiple choice questions")
    parser.add_argument("--structured", type=int, default=0, help="How many structured questions")
    parser.add_argument("--essay", type=int, default=0, help="How many essay questions")
    parser.add_argument("--title", help="Paper title (one is made up if you leave it out)")
    parser.add_argument("--plan-only", action="store_true", help="Show the shape, write nothing")
    args = parser.parse_args()

    counts = {
        AnswerMode.MCQ: args.mcq,
        AnswerMode.STRUCTURED: args.structured,
        AnswerMode.ESSAY: args.essay,
    }

    with SessionLocal() as db:
        known = topics_by_code(db)
        unknown = [code for code in args.topics if code not in known]
        if unknown:
            sys.exit(f"Unknown topic(s): {', '.join(unknown)}. See python -m app.import_syllabus.")

        title = args.title or _title(known, args.topics)
        blueprint = build_blueprint(title, args.topics, counts)
        if found := problems(blueprint):
            sys.exit("\n".join(f"- {problem}" for problem in found))

        _say_plan(blueprint, known)
        if args.plan_only:
            return

        author = build_author(get_settings())
        if author is None:
            sys.exit("No AI model is configured. Set a key in .env first.")

        print(f"\nWriting with {author.name}. This takes a minute or two...")
        topic_lines = [f"{code} {known[code].name}" for code in args.topics]
        try:
            written = generate(blueprint, author, topic_lines)
        except DomainError as error:
            sys.exit(f"{error.message}\n" + "\n".join(f"  - {e}" for e in error.errors))
        except Exception as error:  # network, quota, or a reply that made no sense
            sys.exit(f"The model could not be used: {error}")

        _save(db, written)


def _title(known: dict, codes: list[str]) -> str:
    names = [known[code].name for code in codes[:2]]
    more = f" and {len(codes) - 2} more" if len(codes) > 2 else ""
    return f"Model paper: {', '.join(names)}{more}"


def _say_plan(blueprint, known: dict) -> None:
    print(f"{blueprint.title}\n")
    for code in blueprint.topic_codes:
        print(f"  topic   {code}  {known[code].name}")
    for section in blueprint.sections:
        print(f"  section {section.code:<5} {section.count} x {section.title.lower()}")
    print(f"\n  {blueprint.questions} questions, {blueprint.marks:g} marks, {blueprint.duration}")


def _save(db, written) -> None:
    try:
        paper = create_paper(db, written.paper)
        scheme = create_scheme(db, paper.id, written.scheme)
    except DomainError as error:
        sys.exit(f"The draft could not be saved: {error.message}")

    print(f"\nSaved paper {paper.id} and marking scheme v{scheme.version}, both as drafts.")
    print(f"  kept {written.kept} questions, written by {written.written_by}")
    if written.dropped:
        print(f"  dropped {len(written.dropped)}:")
        for reason in written.dropped:
            print(f"    - {reason}")
    print("\nRead it, fix anything wrong, then publish the scheme and the paper.")


if __name__ == "__main__":
    main()
