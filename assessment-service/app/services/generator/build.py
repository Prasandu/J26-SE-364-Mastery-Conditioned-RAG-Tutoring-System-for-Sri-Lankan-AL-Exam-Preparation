"""Turning what the model wrote into a draft paper and a draft marking scheme.

Everything here is checking. A model writes plausible text, so each question is
measured against what the system can actually mark: a multiple choice question needs
five options and one key, every question needs marking points, and the points must add
up to the marks the question is worth. Anything that fails is dropped with a note
rather than quietly saved.

The result is always a draft. An AI wrote the scheme, so a teacher publishes it.
"""

from dataclasses import dataclass, field
from math import isclose

from app.ai.author import QuestionAuthor, WrittenQuestion, build_brief
from app.errors import ContentValidationError
from app.models import AnswerMode, PointType
from app.schemas.admin import (
    MarkingSchemeIn,
    OptionIn,
    PaperIn,
    PointIn,
    QuestionIn,
    QuestionSchemeIn,
    SectionIn,
)
from app.services.generator.blueprint import Blueprint, SectionPlan

MCQ_OPTIONS = 5
MCQ_KEY_CODE = "K"
POINT_TYPES = {t.value for t in PointType}


@dataclass
class Generated:
    """A finished draft, and a note of anything that had to be dropped."""

    paper: PaperIn
    scheme: MarkingSchemeIn
    written_by: str
    kept: int = 0
    dropped: list[str] = field(default_factory=list)


def generate(blueprint: Blueprint, author: QuestionAuthor, topic_lines: list[str]) -> Generated:
    """Write every section of the paper, then assemble the draft."""
    sections: list[SectionIn] = []
    entries: list[QuestionSchemeIn] = []
    dropped: list[str] = []
    asked: list[str] = []

    for plan in blueprint.sections:
        written = author.write(
            build_brief(
                answer_mode=plan.answer_mode.value,
                count=plan.count,
                marks_each=plan.marks / plan.count,
                topics=topic_lines,
                avoid=asked,
            )
        )
        usable = []
        for question in written.questions[: plan.count]:
            reason = _unusable(question, plan)
            if reason:
                dropped.append(f"{plan.title} {question.label or '?'}: {reason}")
                continue
            usable.append(question)
            asked.append(question.text[:120])

        if usable:
            sections.append(_section(plan, usable, blueprint.topic_codes))
            entries.extend(_scheme_entries(plan, usable))

    if not sections:
        # A paper needs at least one markable question. Saying why is more use than
        # an empty draft nobody can do anything with.
        raise ContentValidationError(
            "Nothing usable was written. Try again, or ask for fewer questions at once.",
            dropped or ["The model returned no questions"],
        )

    return Generated(
        paper=PaperIn(
            title=blueprint.title,
            subject="chemistry",
            kind="model",
            year=None,
            sections=sections,
        ),
        scheme=MarkingSchemeIn(
            source="generated",
            notes=f"Written by {author.name} from {', '.join(blueprint.topic_codes)}",
            questions=entries,
        ),
        written_by=author.name,
        kept=sum(len(s.questions) for s in sections),
        dropped=dropped,
    )


def _unusable(question: WrittenQuestion, plan: SectionPlan) -> str | None:
    """Why this question cannot be marked, or None when it can."""
    if not question.text.strip():
        return "no question text"
    if not question.points:
        return "no marking points, so nothing could be marked"

    for point in question.points:
        if point.point_type not in POINT_TYPES:
            return f"unknown marking point type '{point.point_type}'"
        if point.marks <= 0:
            return f"point {point.code} is worth {point.marks:g} marks"

    total = sum(point.marks for point in question.points)
    worth = plan.marks / plan.count
    if not isclose(total, worth):
        return f"marking points add up to {total:g}, not {worth:g}"

    if plan.answer_mode == AnswerMode.MCQ:
        return _unusable_mcq(question)
    if any(point.point_type == PointType.MCQ_KEY.value for point in question.points):
        return "a written question cannot have a multiple choice key"
    return None


def _unusable_mcq(question: WrittenQuestion) -> str | None:
    labels = [option.label for option in question.options]
    if len(labels) != MCQ_OPTIONS:
        return f"{len(labels)} options, not {MCQ_OPTIONS}"
    if len(set(labels)) != MCQ_OPTIONS:
        return "two options share a label"
    if any(not option.text.strip() for option in question.options):
        return "an option has no text"

    keys = [p for p in question.points if p.point_type == PointType.MCQ_KEY.value]
    if len(question.points) != 1 or len(keys) != 1:
        return "needs exactly one mcq_key marking point"
    if keys[0].description.strip() not in labels:
        return f"the key '{keys[0].description.strip()}' is not one of the options"
    return None


def _section(plan: SectionPlan, questions: list[WrittenQuestion], topics: list[str]) -> SectionIn:
    return SectionIn(
        code=plan.code,
        title=plan.title,
        answer_mode=plan.answer_mode,
        choose_count=None,
        instructions=None,
        questions=[
            QuestionIn(
                label=str(number),
                text=question.text.strip(),
                max_marks=plan.marks / plan.count,
                options=(
                    [OptionIn(label=o.label, text=o.text) for o in question.options]
                    if plan.answer_mode == AnswerMode.MCQ
                    else None
                ),
                topics=[question.topic_code] if question.topic_code in topics else [],
                sub_questions=[],
            )
            for number, question in enumerate(questions, start=1)
        ],
    )


def _scheme_entries(plan: SectionPlan, questions: list[WrittenQuestion]) -> list[QuestionSchemeIn]:
    return [
        QuestionSchemeIn(
            section=plan.code,
            question=str(number),
            model_answer=question.answer.strip() or None,
            points=[
                PointIn(
                    code=_point_code(plan, point.code, order),
                    description=point.description.strip(),
                    marks=point.marks,
                    point_type=point.point_type,
                    expected=(
                        {"option": point.description.strip()}
                        if point.point_type == PointType.MCQ_KEY.value
                        else None
                    ),
                    alternatives=[],
                )
                for order, point in enumerate(question.points, start=1)
            ],
            rules=[],
        )
        for number, question in enumerate(questions, start=1)
    ]


def _point_code(plan: SectionPlan, written: str, order: int) -> str:
    """Keep the model's code when it is sensible, otherwise number it ourselves."""
    if plan.answer_mode == AnswerMode.MCQ:
        return MCQ_KEY_CODE
    cleaned = written.strip().upper()[:20]
    return cleaned if cleaned else f"P{order}"
