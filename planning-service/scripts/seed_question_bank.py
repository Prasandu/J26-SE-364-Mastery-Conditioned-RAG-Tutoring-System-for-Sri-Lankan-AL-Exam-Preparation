"""Seed the planning question bank from the shared CSV contract."""

from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from pathlib import Path
from typing import TYPE_CHECKING, Any

from scripts.seed_topics import DEFAULT_TOPICS_PATH, load_topics

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_QUESTION_BANK_PATH = SCRIPT_DIR.parents[1] / "shared" / "contracts" / "question_bank.csv"
REQUIRED_FIELDS = {
    "paper_id",
    "year",
    "type",
    "total_marks",
    "question_id",
    "question_no",
    "topic_id",
    "sub_topic_id",
    "max_marks",
}


def load_question_bank(
    csv_path: Path = DEFAULT_QUESTION_BANK_PATH,
    topics_path: Path = DEFAULT_TOPICS_PATH,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    topic_rows = load_topics(topics_path)
    topic_by_id = {topic["id"]: topic for topic in topic_rows}
    try:
        handle = csv_path.open(encoding="utf-8-sig", newline="")
    except OSError as exc:
        raise ValueError(f"Cannot open question-bank CSV {csv_path}: {exc}") from exc

    papers: dict[str, dict[str, Any]] = {}
    questions: list[dict[str, Any]] = []
    question_ids: set[str] = set()
    question_numbers: set[tuple[str, str]] = set()
    marks_by_paper: dict[str, float] = defaultdict(float)
    with handle:
        reader = csv.DictReader(handle)
        missing = REQUIRED_FIELDS - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{csv_path} is missing columns: {', '.join(sorted(missing))}.")
        for line_number, row in enumerate(reader, start=2):
            paper_id = _required(row, "paper_id", csv_path, line_number)
            question_id = _required(row, "question_id", csv_path, line_number)
            question_no = _required(row, "question_no", csv_path, line_number)
            paper_type = _required(row, "type", csv_path, line_number)
            topic_id = _required(row, "topic_id", csv_path, line_number)
            sub_topic_id = row.get("sub_topic_id", "").strip() or None
            try:
                year = int(row["year"])
                total_marks = float(row["total_marks"])
                max_marks = float(row["max_marks"])
            except (TypeError, ValueError) as exc:
                raise ValueError(f"{csv_path}:{line_number} has invalid numeric values.") from exc

            if not 1900 <= year <= 2200:
                raise ValueError(f"{csv_path}:{line_number} has an invalid year.")
            if total_marks <= 0 or max_marks <= 0:
                raise ValueError(f"{csv_path}:{line_number} marks must be positive.")
            if topic_id not in topic_by_id:
                raise ValueError(f"{csv_path}:{line_number} has unknown topic_id {topic_id!r}.")
            if sub_topic_id is not None and (
                sub_topic_id not in topic_by_id
                or topic_by_id[sub_topic_id]["parent_id"] != topic_id
            ):
                raise ValueError(
                    f"{csv_path}:{line_number} sub_topic_id must be a child of topic_id."
                )
            paper = {
                "paper_id": paper_id,
                "year": year,
                "type": paper_type,
                "total_marks": total_marks,
            }
            if paper_id in papers and papers[paper_id] != paper:
                raise ValueError(f"{csv_path}:{line_number} conflicts with paper {paper_id!r}.")
            papers[paper_id] = paper
            if question_id in question_ids:
                raise ValueError(f"{csv_path}:{line_number} duplicates question_id {question_id!r}.")
            key = (paper_id, question_no)
            if key in question_numbers:
                raise ValueError(
                    f"{csv_path}:{line_number} duplicates question number {question_no!r} "
                    f"for paper {paper_id!r}."
                )
            question_ids.add(question_id)
            question_numbers.add(key)
            marks_by_paper[paper_id] += max_marks
            questions.append(
                {
                    "question_id": question_id,
                    "paper_id": paper_id,
                    "question_no": question_no,
                    "topic_id": topic_id,
                    "sub_topic_id": sub_topic_id,
                    "max_marks": max_marks,
                }
            )

    for paper_id, total_question_marks in marks_by_paper.items():
        if total_question_marks > papers[paper_id]["total_marks"]:
            raise ValueError(f"Question marks exceed total_marks for paper {paper_id!r}.")
    if not questions:
        raise ValueError(f"{csv_path} contains no question rows.")
    return list(papers.values()), questions


def seed_question_bank(
    session: Session,
    papers: list[dict[str, Any]],
    questions: list[dict[str, Any]],
) -> tuple[int, int]:
    from sqlalchemy.dialects.postgresql import insert

    from app.models import Paper, Question

    for paper in papers:
        statement = insert(Paper).values(**paper)
        statement = statement.on_conflict_do_update(
            index_elements=[Paper.paper_id],
            set_={
                "year": statement.excluded.year,
                "type": statement.excluded.type,
                "total_marks": statement.excluded.total_marks,
            },
        )
        session.execute(statement)
    for question in questions:
        statement = insert(Question).values(**question)
        statement = statement.on_conflict_do_update(
            index_elements=[Question.question_id],
            set_={
                "paper_id": statement.excluded.paper_id,
                "question_no": statement.excluded.question_no,
                "topic_id": statement.excluded.topic_id,
                "sub_topic_id": statement.excluded.sub_topic_id,
                "max_marks": statement.excluded.max_marks,
            },
        )
        session.execute(statement)
    session.commit()
    return len(papers), len(questions)


def _required(row: dict[str, str], field: str, path: Path, line_number: int) -> str:
    value = row.get(field, "").strip()
    if not value:
        raise ValueError(f"{path}:{line_number} requires {field}.")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="Load the shared assessment question bank.")
    parser.add_argument("--file", type=Path, default=DEFAULT_QUESTION_BANK_PATH)
    parser.add_argument("--topics", type=Path, default=DEFAULT_TOPICS_PATH)
    args = parser.parse_args()
    papers, questions = load_question_bank(args.file, args.topics)

    from app.db import SessionLocal

    with SessionLocal() as session:
        paper_count, question_count = seed_question_bank(session, papers, questions)
    print(f"Seeded {paper_count} papers and {question_count} questions from {args.file}")


if __name__ == "__main__":
    main()
