"""Throw away attempts and practice papers made while testing.

  python -m app.clear_test_data --list
  python -m app.clear_test_data --students SPEED-NEW PROFILE3 --dry-run
  python -m app.clear_test_data --students SPEED-NEW PROFILE3
  python -m app.clear_test_data --keep S001 S002 --dry-run

Worth doing before the first real session: an export that mixes made-up attempts with
real ones is no use for the evaluation.

Only attempts and empty practice papers are removed. Past papers, the sample paper and
anything a teacher has reviewed are never touched by --keep, and nothing at all is
removed without --dry-run being run first by you.
"""

import argparse

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import Attempt, Paper, PointResult

REVIEWED = "has teacher marking"


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--list", action="store_true", help="Show what is in the database")
    parser.add_argument("--students", nargs="*", help="Student refs whose attempts to remove")
    parser.add_argument("--keep", nargs="*", help="Remove every attempt EXCEPT these refs")
    parser.add_argument("--papers", action="store_true", help="Also remove practice papers nobody sat")
    parser.add_argument("--dry-run", action="store_true", help="Say what would go, remove nothing")
    args = parser.parse_args()

    with SessionLocal() as db:
        if args.list or not (args.students or args.keep):
            _show(db)
            if not args.list:
                print("\nNothing removed. Use --students or --keep to choose, then --dry-run.")
            return

        chosen = _chosen(db, args)
        protected = _reviewed_refs(db)
        safe = [ref for ref in chosen if ref not in protected]
        if blocked := sorted(set(chosen) & protected):
            print(f"Kept, because a teacher has marked them: {', '.join(blocked)}")

        _remove(db, safe, args)


def _show(db) -> None:
    rows = db.execute(select(Attempt.student_ref, func.count()).group_by(Attempt.student_ref)).all()
    reviewed = _reviewed_refs(db)
    print(f"{sum(n for _, n in rows)} attempts by {len(rows)} students\n")
    for ref, count in sorted(rows, key=lambda r: (-r[1], r[0])):
        mark = f"  <- {REVIEWED}" if ref in reviewed else ""
        print(f"  {count:>3}  {ref}{mark}")

    empty = _empty_practice(db)
    print(f"\n{len(empty)} practice papers nobody has sat")
    for paper in empty:
        print(f"  {paper.id}  {paper.created_by}  {paper.title[:50]}")


def _chosen(db, args) -> list[str]:
    if args.students:
        return list(args.students)
    everyone = db.scalars(select(Attempt.student_ref).distinct()).all()
    return [ref for ref in everyone if ref not in set(args.keep or [])]


def _reviewed_refs(db) -> set[str]:
    """Students whose marking a teacher has looked at. Those are research data."""
    stmt = (
        select(Attempt.student_ref)
        .join(Attempt.answers)
        .join(PointResult, PointResult.answer_id == Attempt.answers.property.mapper.class_.id)
        .where(PointResult.teacher_awarded.is_not(None))
        .distinct()
    )
    return set(db.scalars(stmt).all())


def _empty_practice(db) -> list[Paper]:
    sat = select(Attempt.paper_id).distinct()
    stmt = select(Paper).where(Paper.created_by.is_not(None), Paper.id.not_in(sat))
    return list(db.scalars(stmt))


def _remove(db, refs: list[str], args) -> None:
    attempts = db.scalars(select(Attempt).where(Attempt.student_ref.in_(refs))).all() if refs else []
    papers = _empty_practice(db) if args.papers else []

    print(f"\n{len(attempts)} attempts and {len(papers)} practice papers would go.")
    if args.dry_run:
        for ref in sorted(set(refs))[:20]:
            print(f"  attempts of {ref}")
        for paper in papers[:20]:
            print(f"  paper {paper.id} {paper.title[:50]}")
        print("\nDry run: nothing was removed.")
        return

    for attempt in attempts:
        db.delete(attempt)
    for paper in papers:
        db.delete(paper)
    db.commit()
    print(f"Removed {len(attempts)} attempts and {len(papers)} practice papers.")


if __name__ == "__main__":
    main()
