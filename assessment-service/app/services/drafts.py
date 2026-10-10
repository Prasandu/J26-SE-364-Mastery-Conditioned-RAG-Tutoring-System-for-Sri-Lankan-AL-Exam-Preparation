"""Turning extracted pages into the bodies the admin API accepts.

A plan file says how the pages map onto sections, because a scanned page does not
say which part of the paper it belongs to.
"""

import itertools
import json
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models import AnswerMode, PaperKind, PointType, SchemeSource
from app.schemas.admin import MarkingSchemeIn, PaperIn
from app.services.pdf import parse_pages

# Papers print option labels as "(1)" or "1."; the answer key prints plain "1".
_BRACKETS = (("(", ")"), ("[", "]"))
# Some options are printed as graphs or structures, so they have no text of their own.
FIGURE_OPTION = "[figure {label}]"


class OptionGroup(BaseModel):
    """One shared-options block, e.g. "for questions 41 to 50, select from responses (1) to (5)"."""

    model_config = ConfigDict(extra="forbid")

    questions: str = Field(description='Which question numbers this applies to, e.g. "41-50"')
    options: list[dict[str, str]] = Field(min_length=1)

    def covers(self, label: str) -> bool:
        # question ranges like "31-40,45" are parsed the same way as PDF page ranges
        return label.isdigit() and int(label) in parse_pages(self.questions)


class SectionPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    title: str
    answer_mode: AnswerMode
    choose_count: int | None = None
    instructions: str | None = None
    marks_each: float | None = Field(default=None, description="Marks per question, when the paper is even")
    shared_options: list[dict[str, str]] = Field(
        default_factory=list,
        description="Options printed once for the whole section, used where a question has none",
    )
    option_groups: list[OptionGroup] = Field(
        default_factory=list,
        description="Use when different question ranges share different sets of options",
    )
    drafts: list[Path] = Field(min_length=1, description="Draft files from app.import_pdf, in order")

    def options_for(self, label: str) -> list[dict[str, str]]:
        for group in self.option_groups:
            if group.covers(label):
                return group.options
        return self.shared_options

    def has_shared_options_for(self, label: str) -> bool:
        return bool(self.options_for(label))


class PaperPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    kind: PaperKind = PaperKind.PAST
    year: int | None = None
    subject: str = "chemistry"
    sections: list[SectionPlan] = Field(min_length=1)


def clean_label(label: str) -> str:
    """ "(1)" and "1." both become "1", but "2(b)(i)" keeps its brackets."""
    text = label.strip().rstrip(".").strip()
    for opening, closing in _BRACKETS:
        wrapped = text.startswith(opening) and text.endswith(closing) and opening not in text[1:-1]
        if wrapped:
            text = text[1:-1].strip()
    return text


def load_plan(path: Path) -> PaperPlan:
    plan = PaperPlan.model_validate_json(path.read_text(encoding="utf-8"))
    for section in plan.sections:
        section.drafts = [_beside(path, draft) for draft in section.drafts]
    return plan


def _beside(plan: Path, draft: Path) -> Path:
    """Draft paths in a plan are relative to the plan file."""
    return draft if draft.is_absolute() else plan.parent / draft


def build_paper(plan: PaperPlan) -> PaperIn:
    """The plan plus its draft files as one body for POST /admin/papers."""
    return PaperIn.model_validate(
        {
            "title": plan.title,
            "kind": plan.kind,
            "year": plan.year,
            "subject": plan.subject,
            "sections": [_section(section) for section in plan.sections],
        }
    )


def _section(plan: SectionPlan) -> dict[str, Any]:
    questions = [
        _question(question, plan)
        for draft in plan.drafts
        for part in _extracted(draft)
        for question in part.get("questions", [])
    ]
    return {
        "code": plan.code,
        "title": plan.title,
        "answer_mode": plan.answer_mode,
        "choose_count": plan.choose_count,
        "instructions": plan.instructions,
        "questions": questions,
    }


def _question(extracted: dict[str, Any], plan: SectionPlan) -> dict[str, Any]:
    subs = [_question(sub, plan) for sub in extracted.get("sub_questions") or []]
    options = [_option(option) for option in extracted.get("options") or []]
    label = clean_label(extracted["label"])
    if not options and not subs:
        options = [dict(option) for option in plan.options_for(label)]
    marks = extracted.get("max_marks")
    if marks is None and not subs:
        marks = plan.marks_each
    return {
        "label": label,
        "text": extracted.get("text", ""),
        "max_marks": marks,
        "options": options or None,
        "sub_questions": subs,
    }


def _expected(extracted: dict[str, Any] | None) -> dict[str, Any] | None:
    """Drop the fields the marking scheme did not fill in."""
    if not extracted:
        return None
    filled = {key: value for key, value in extracted.items() if value is not None}
    return filled or None


def _option(extracted: dict[str, Any]) -> dict[str, str]:
    label = clean_label(extracted["label"])
    text = (extracted.get("text") or "").strip()
    return {"label": label, "text": text or FIGURE_OPTION.format(label=label)}


def _extracted(draft: Path, kind: str = "paper") -> list[dict[str, Any]]:
    data = json.loads(draft.read_text(encoding="utf-8"))
    if data.get("kind") != kind:
        raise ValueError(f"{draft.name} was imported as '{data.get('kind')}', not '{kind}'")
    return data.get("extracted", [])


# Marking schemes


class SchemeSectionPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    mcq_marks: float | None = Field(default=None, description="Marks per MCQ, for an answer-key page")
    drafts: list[Path] = Field(min_length=1, description="Draft files from app.import_pdf --kind scheme")


class SchemePlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paper_id: int
    source: SchemeSource = SchemeSource.OFFICIAL
    notes: str | None = None
    sections: list[SchemeSectionPlan] = Field(min_length=1)


def load_scheme_plan(path: Path) -> SchemePlan:
    plan = SchemePlan.model_validate_json(path.read_text(encoding="utf-8"))
    for section in plan.sections:
        section.drafts = [_beside(path, draft) for draft in section.drafts]
    return plan


def build_scheme(plan: SchemePlan) -> MarkingSchemeIn:
    """The plan plus its draft files as one body for POST /admin/papers/{id}/marking-schemes."""
    questions: list[dict[str, Any]] = []
    for section in plan.sections:
        for draft in section.drafts:
            for part in _extracted(draft, "scheme"):
                questions.extend(_answer_key(section, part.get("mcq_answers") or []))
                questions.extend(_marked_questions(section, part.get("questions") or []))
    return MarkingSchemeIn.model_validate(
        {"source": plan.source, "notes": plan.notes, "questions": questions}
    )


def _answer_key(section: SchemeSectionPlan, answers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One mcq_key point per question in an answer-key table."""
    if answers and section.mcq_marks is None:
        raise ValueError(f'Section {section.code} has an answer key, so it needs "mcq_marks"')
    return [
        {
            "section": section.code,
            "question": clean_label(answer["question"]),
            "points": [
                {
                    "code": "K",
                    "description": "Correct option",
                    "marks": section.mcq_marks,
                    "point_type": PointType.MCQ_KEY,
                    "expected": {"option": key},
                    "alternatives": alternatives,
                }
            ],
        }
        for answer in answers
        for key, *alternatives in [_accepted_options(answer["option"])]
    ]


def _accepted_options(printed: str) -> list[str]:
    """A scheme may accept more than one option as correct, printed like "4/5"."""
    return [clean_label(option) for option in printed.split("/")]


def _marked_questions(section: SchemeSectionPlan, extracted: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "section": section.code,
            "question": clean_label(entry["question"]),
            "model_answer": entry.get("model_answer"),
            "points": [_point(point, number) for number, point in enumerate(entry.get("points") or [], 1)],
        }
        for entry in extracted
    ]


def _point(extracted: dict[str, Any], number: int) -> dict[str, Any]:
    return {
        "code": f"P{number}",
        "description": extracted["description"],
        "marks": extracted["marks"],
        "point_type": extracted.get("point_type") or PointType.CONCEPT,
        "expected": _expected(extracted.get("expected")),
        "alternatives": extracted.get("alternatives") or [],
    }


# Checking an imported draft


@dataclass(frozen=True)
class DraftProblem:
    message: str
    pages: list[int]  # where to look, and what to read again
    blocking: bool = True  # False for things a person only needs to know about


def draft_problems(
    draft: dict[str, Any], *, covered: Callable[[str], bool] | None = None
) -> list[DraftProblem]:
    """Signs that the model missed something: gaps in the numbering, MCQs without options.

    `covered` says whether a plan already supplies shared options for a question label; without
    a plan, nothing is covered and every missing-options question is reported.
    """
    parts = draft.get("extracted", [])
    if draft.get("kind") == "scheme":
        numbered = [(answer["question"], part) for part in parts for answer in part.get("mcq_answers") or []]
        return _numbering_gaps(numbered)

    numbered = [(question["label"], part) for part in parts for question in part.get("questions") or []]
    return (
        _numbering_gaps(numbered)
        + _missing_options(parts, covered or (lambda _: False))
        + _figure_questions(parts)
    )


def _numbering_gaps(labelled: list[tuple[str, dict[str, Any]]]) -> list[DraftProblem]:
    numbered = [(int(label), part) for raw, part in labelled if (label := clean_label(raw)).isdigit()]
    problems = []
    for (number, part), (following, _) in itertools.pairwise(numbered):
        if following > number + 1:
            message = (
                f"Question {number + 1} is missing"
                if following == number + 2
                else f"Questions {number + 1}-{following - 1} are missing"
            )
            problems.append(DraftProblem(message, part.get("pages", [])))
    return problems


def _missing_options(parts: list[dict[str, Any]], covered: Callable[[str], bool]) -> list[DraftProblem]:
    questions = [(question, part) for part in parts for question in part.get("questions") or []]
    with_options = sum(bool(question.get("options")) for question, _ in questions)
    if with_options * 2 < len(questions):  # not a multiple choice section
        return []

    problems = []
    for question, part in questions:
        if question.get("options"):
            continue
        label = clean_label(question["label"])
        if covered(label):  # a plan's shared_options/option_groups already supply these
            continue
        message = f"Q{label} has no options (re-read the page, or add shared_options/option_groups)"
        problems.append(DraftProblem(message, part.get("pages", [])))
    return problems


def _figure_questions(parts: list[dict[str, Any]]) -> list[DraftProblem]:
    """Questions a student cannot answer from the text alone, so the page image is needed."""
    labels = [
        clean_label(question["label"])
        for part in parts
        for question in part.get("questions") or []
        if question.get("has_figure")
    ]
    if not labels:
        return []
    message = f"Q{', Q'.join(labels)} rely on figures, so students need the page image"
    return [DraftProblem(message, [], blocking=False)]


def plan_problems(sections: list[SectionPlan] | list[SchemeSectionPlan]) -> tuple[list[str], list[str]]:
    """What must be fixed before loading, and what a person only needs to know."""
    blocking, notes = [], []
    for section in sections:
        # Only a paper's SectionPlan can supply shared options; a SchemeSectionPlan never needs to
        # (draft_problems only consults `covered` for paper drafts, never for scheme drafts).
        covered = getattr(section, "has_shared_options_for", lambda _: False)
        for path in section.drafts:
            draft = json.loads(path.read_text(encoding="utf-8"))
            unread = sorted({page for entry in draft.get("failed", []) for page in entry["pages"]})
            if unread:
                blocking.append(f"{path.name}: pages {', '.join(map(str, unread))} were never read")
            for problem in draft_problems(draft, covered=covered):
                where = blocking if problem.blocking else notes
                where.append(f"{path.name}: {problem.message}")
    return blocking, notes
