"""Read the A/L Chemistry syllabus into the topic tree.

  python -m app.import_syllabus read syllabus.pdf          write drafts/syllabus.json
  python -m app.import_syllabus read syllabus.pdf --out t.json
  python -m app.import_syllabus load drafts/syllabus.json  put the topics in the database
  python -m app.import_syllabus load drafts/syllabus.json --dry-run

Two steps on purpose. The syllabus PDF is a four column table, so a few headings come
out with a stray page number or a missing space. Read it, open the JSON, fix anything
odd, then load it. These topics decide what a generated paper may ask about.
"""

import argparse
import json
import sys
from pathlib import Path

from app.db import SessionLocal
from app.errors import DomainError
from app.schemas.admin import TopicIn
from app.services.syllabus import as_topic_rows, parse_syllabus, read_pdf_text
from app.services.topics import (
    create_topic,
    rename_topic,
    set_topic_content,
    topic_contents,
    topics_by_code,
)

DEFAULT_OUT = Path("drafts/syllabus.json")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    jobs = parser.add_subparsers(dest="job", required=True)

    read = jobs.add_parser("read", help="Pull the topics out of the syllabus PDF")
    read.add_argument("pdf", type=Path)
    read.add_argument("--out", type=Path, default=DEFAULT_OUT)

    load = jobs.add_parser("load", help="Put a checked topic file into the database")
    load.add_argument("topics", type=Path)
    load.add_argument("--dry-run", action="store_true", help="Say what would happen, change nothing")
    load.add_argument(
        "--update",
        action="store_true",
        help="Also correct the names of topics already in the database",
    )

    args = parser.parse_args()
    _read(args) if args.job == "read" else _load(args)


def _read(args) -> None:
    if not args.pdf.is_file():
        sys.exit(f"No such file: {args.pdf}")

    try:
        units = parse_syllabus(read_pdf_text(args.pdf))
    except (OSError, ValueError) as error:
        sys.exit(f"The syllabus could not be read: {error}")
    if not units:
        sys.exit("No units were found. Is this the NIE Chemistry syllabus PDF?")

    rows = as_topic_rows(units)
    try:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    except OSError as error:
        sys.exit(f"Could not write {args.out}: {error}")

    bullets = sum(len(row.get("contents", [])) for row in rows)
    thin = [row["code"] for row in rows if row["parent_code"] and not row.get("contents")]

    print(
        f"{len(units)} units, {len(rows) - len(units)} sub-topics, {bullets} content bullets -> {args.out}\n"
    )
    for unit in units:
        covered = sum(1 for sub in unit.sub_topics if sub.contents)
        print(
            f"  {unit.code}  {unit.name}  ({unit.periods} periods, "
            f"{covered}/{len(unit.sub_topics)} levels with content)"
        )

    if thin:
        print(f"\n{len(thin)} levels have no content: {', '.join(thin)}")
        print("Their bullets sit in another column of the PDF and could not be matched.")
        print("Add them by hand if you want questions on those grounded in the syllabus.")
    print("\nRead the file and fix anything odd, then load it.")


def _load(args) -> None:
    if not args.topics.is_file():
        sys.exit(f"No such file: {args.topics}")
    try:
        rows = [TopicIn(**row) for row in json.loads(args.topics.read_text(encoding="utf-8"))]
    except (OSError, ValueError) as error:
        sys.exit(f"The topic file could not be read: {error}")

    with SessionLocal() as db:
        existing = topics_by_code(db)
        fresh = [row for row in rows if row.code not in existing]
        renamed = [r for r in rows if r.code in existing and existing[r.code].name != r.name]
        recontented = [
            r for r in rows if r.code in existing and topic_contents(existing[r.code]) != r.contents
        ]
        if not args.update:
            renamed = []
            recontented = []

        _say_plan(rows, fresh, renamed, update=args.update)
        if args.dry_run:
            _say_dry_run(fresh, renamed)
            return

        print(f"Added {_add_topics(db, fresh)} topics.")
        if renamed:
            for row in renamed:
                rename_topic(db, row.code, row.name)
            print(f"Renamed {len(renamed)} topics.")
        if recontented:
            for row in recontented:
                set_topic_content(db, row.code, row.contents)
            print(f"Updated what {len(recontented)} topics cover.")


def _say_plan(rows: list[TopicIn], fresh: list[TopicIn], renamed: list[TopicIn], *, update: bool) -> None:
    print(f"{len(rows)} topics in the file, {len(rows) - len(fresh)} already in the database")
    if not update:
        print("Names already in the database are left alone. Use --update to correct them.")
    elif renamed:
        print(f"{len(renamed)} have a different name in the file")


def _say_dry_run(fresh: list[TopicIn], renamed: list[TopicIn]) -> None:
    for row in fresh[:10]:
        print(f"  would add {row.code}  {row.name}")
    for row in renamed[:10]:
        print(f"  would rename {row.code}  {row.name}")
    print(f"\nDry run: {len(fresh)} added, {len(renamed)} renamed.")


def _add_topics(db, fresh: list[TopicIn]) -> int:
    added = 0
    for row in fresh:  # parents come before their children in the file
        try:
            create_topic(db, row)
            added += 1
        except DomainError as error:
            print(f"  skipped {row.code}: {error.message}")
    return added


if __name__ == "__main__":
    main()
