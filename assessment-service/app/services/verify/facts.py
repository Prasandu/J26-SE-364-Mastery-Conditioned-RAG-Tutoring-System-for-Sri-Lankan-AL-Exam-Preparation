"""One shape the validators work on, whatever the question came from.

A question arrives either straight from the model that wrote it or out of the
database, and the checks are the same either way. Rather than teach every validator
both shapes, both are flattened to this one first.
"""

from collections.abc import Iterable
from dataclasses import dataclass, field

from app.ai.author import WrittenQuestion
from app.models import AnswerMode, MarkingPoint, MarkingScheme, PointType
from app.services.generator.blueprint import SectionPlan

EXPECTED_VALUE = "value"
EXPECTED_UNIT = "unit"
EXPECTED_WORKING = "working"


@dataclass(frozen=True)
class PointFacts:
    """One marking point as the validators see it."""

    code: str
    description: str
    marks: float
    point_type: str
    expected: dict | None = None
    alternatives: list[str] = field(default_factory=list)

    @property
    def expected_value(self) -> float | None:
        value = (self.expected or {}).get(EXPECTED_VALUE)
        return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else None

    @property
    def expected_unit(self) -> str | None:
        unit = (self.expected or {}).get(EXPECTED_UNIT)
        return unit if isinstance(unit, str) and unit.strip() else None

    @property
    def working(self) -> str | None:
        working = (self.expected or {}).get(EXPECTED_WORKING)
        return working if isinstance(working, str) and working.strip() else None


@dataclass(frozen=True)
class RuleFacts:
    """One marking rule, in the shape app/services/marks.py expects."""

    rule_type: str
    params: dict


@dataclass(frozen=True)
class QuestionFacts:
    """One question with its marking scheme, ready to be checked."""

    where: str
    label: str
    text: str
    answer_mode: AnswerMode
    max_marks: float
    points: list[PointFacts]
    options: list[tuple[str, str]] = field(default_factory=list)
    model_answer: str | None = None
    # Rules change what a perfect answer scores, so the marks check needs them.
    rules: list[RuleFacts] = field(default_factory=list)

    @property
    def is_mcq(self) -> bool:
        return self.answer_mode == AnswerMode.MCQ

    def at(self, point: PointFacts) -> str:
        return f"{self.where} {point.code}"


def from_written(question: WrittenQuestion, plan: SectionPlan, number: int) -> QuestionFacts:
    """A question as the model wrote it, before anything is saved."""
    return QuestionFacts(
        where=f"Section {plan.code} Q{number}",
        label=str(number),
        text=question.text.strip(),
        answer_mode=plan.answer_mode,
        max_marks=plan.marks / plan.count,
        points=[
            PointFacts(
                code=point.code.strip().upper() or f"P{order}",
                description=point.description.strip(),
                marks=point.marks,
                point_type=point.point_type,
                expected=point.expected_dict(),
                alternatives=list(point.alternatives),
            )
            for order, point in enumerate(question.points, start=1)
        ],
        options=[(option.label, option.text) for option in question.options],
        model_answer=question.answer.strip() or None,
        # Error carried forward is the only rule a model writes, and it does not
        # change the total, so nothing else is needed here.
        rules=[
            RuleFacts("ecf", {"point": ecf.point, "depends_on": list(ecf.depends_on)})
            for ecf in question.carried_forward
        ],
    )


def from_scheme(scheme: MarkingScheme) -> list[QuestionFacts]:
    """Every marked question of a stored scheme, in paper order."""
    answers = {answer.question_id: answer.answer_text for answer in scheme.model_answers}
    points: dict[int, list[MarkingPoint]] = {}
    for point in scheme.points:
        points.setdefault(point.question_id, []).append(point)
    rules: dict[int, list[RuleFacts]] = {}
    for rule in scheme.rules:
        rules.setdefault(rule.question_id, []).append(
            RuleFacts(rule.rule_type.value, dict(rule.params or {}))
        )

    facts = []
    for question in scheme.paper.iter_questions():
        mine = points.get(question.id)
        if not mine or question.max_marks is None:
            continue
        facts.append(
            QuestionFacts(
                where=f"Section {question.section.code} Q{question.full_label}",
                label=question.full_label,
                text=question.text or "",
                answer_mode=question.section.answer_mode,
                max_marks=question.max_marks,
                points=[_point_facts(point) for point in sorted(mine, key=lambda p: p.order_no)],
                options=[(o["label"], o.get("text", "")) for o in question.options or []],
                model_answer=answers.get(question.id),
                rules=rules.get(question.id, []),
            )
        )
    return facts


def _point_facts(point: MarkingPoint) -> PointFacts:
    return PointFacts(
        code=point.code,
        description=point.description,
        marks=point.marks,
        point_type=_type_name(point.point_type),
        expected=point.expected,
        alternatives=list(point.alternatives or []),
    )


def _type_name(point_type: PointType | str) -> str:
    return point_type.value if isinstance(point_type, PointType) else str(point_type)


def texts(facts: Iterable[QuestionFacts]) -> list[tuple[str, str]]:
    """(where, question text) for every question, for the duplicate check."""
    return [(one.where, one.text) for one in facts]
