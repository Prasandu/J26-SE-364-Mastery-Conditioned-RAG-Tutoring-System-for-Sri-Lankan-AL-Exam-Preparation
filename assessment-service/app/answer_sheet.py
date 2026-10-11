"""Print an MCQ answer sheet, or read a photo of a filled one.

  python -m app.answer_sheet make 4                       sheet for paper 4
  python -m app.answer_sheet make 4 --student S001        with the id filled in
  python -m app.answer_sheet make 4 --out sheets/p4.pdf   PNG or PDF, by extension

  python -m app.answer_sheet read photo.jpg --paper 4     our own sheet (corner markers)
  python -m app.answer_sheet read photo.jpg --any --labels 1234
                                                          any sheet, grid worked out

Reading is only a draft. The student confirms it before anything is marked.
"""

import argparse
import sys
from pathlib import Path

from app.db import SessionLocal
from app.errors import DomainError
from app.models import AnswerMode
from app.services.omr.detect import read_any_sheet
from app.services.omr.reader import Mark, SheetError, read_sheet
from app.services.omr.sheet import sheet_pdf, sheet_png
from app.services.papers import get_paper


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    jobs = parser.add_subparsers(dest="job", required=True)

    make = jobs.add_parser("make", help="Print a blank answer sheet")
    make.add_argument("paper_id", type=int)
    make.add_argument("--student", default="", help="Student id to print on the sheet")
    make.add_argument("--out", type=Path, help="File to write (.png or .pdf)")

    read = jobs.add_parser("read", help="Read a photo of a filled sheet")
    read.add_argument("photo", type=Path)
    read.add_argument("--paper", type=int, help="Which paper the sheet is for")
    read.add_argument(
        "--any",
        action="store_true",
        dest="any_sheet",
        help="A sheet we did not print: work the grid out from the picture",
    )
    read.add_argument("--labels", help="Option labels, e.g. ABCDE (default 1,2,3...)")

    args = parser.parse_args()
    if args.job == "make":
        _make(args)
    else:
        _read(args)


def _mcq_count(paper_id: int) -> tuple[str, int]:
    """The paper's title and how many MCQ questions it has."""
    with SessionLocal() as db:
        try:
            paper = get_paper(db, paper_id)
        except DomainError as error:
            sys.exit(error.message)
        questions = sum(
            len(section.questions) for section in paper.sections if section.answer_mode == AnswerMode.MCQ
        )
        if not questions:
            sys.exit(f"Paper {paper_id} has no multiple choice questions.")
        return paper.title, questions


def _make(args) -> None:
    title, questions = _mcq_count(args.paper_id)
    out = args.out or Path(f"sheets/paper{args.paper_id}.pdf")
    data = sheet_pdf if out.suffix.lower() == ".pdf" else sheet_png

    try:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data(title, questions, args.student))
    except (OSError, ValueError) as error:
        sys.exit(f"Could not write {out}: {error}")
    print(f"Wrote {out}: {questions} questions")


def _read(args) -> None:
    if not args.photo.is_file():
        sys.exit(f"No such file: {args.photo}")
    if not args.any_sheet and args.paper is None:
        sys.exit("Give --paper for one of our own sheets, or --any for someone else's.")

    photo = args.photo.read_bytes()
    try:
        if args.any_sheet:
            result = read_any_sheet(photo, list(args.labels) if args.labels else None)
            questions = result.questions
            print(f"Grid found: {questions} questions, {result.options} options each")
        else:
            _, questions = _mcq_count(args.paper)
            result = read_sheet(photo, questions)
    except SheetError as error:
        sys.exit(str(error))

    print(f"{len(result.answers)} of {questions} answered\n")
    for mark in result.marks:
        if mark.state == Mark.FILLED:
            print(f"  Q{mark.question:>2}  {mark.option}")
        else:
            print(f"  Q{mark.question:>2}  -   ({mark.state.value})")

    unsure = [m.question for m in result.marks if m.state == Mark.UNSURE]
    if unsure:
        print(f"\nCheck these by hand, two bubbles look filled: {unsure}")


if __name__ == "__main__":
    main()
