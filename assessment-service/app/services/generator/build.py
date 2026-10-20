"""Turning what the model wrote into a draft paper and a draft marking scheme.

Everything here is checking. A model writes plausible text, so each question goes
through two gates before it is kept:

1. shape    can this be stored and marked at all? Five options and one key for a
            multiple choice question, a known point type, some marking points.
2. verify   does it survive the independent validators in app/services/verify?
            Marks adding up, numbers recomputed, equations balanced, units readable.

A question that fails either is dropped with the reason, rather than quietly saved. If
a section comes up short, the model is asked again for the shortfall, a bounded number
of times, so a bad run ends with a clear error instead of looping.

The result is always a draft. An AI wrote the scheme, so a teacher approves it.
"""

import logging
from dataclasses import dataclass, field

from app.ai.author import QuestionAuthor, WrittenQuestion, build_brief
from app.ai.critic import QuestionCritic
from app.errors import ContentValidationError, ProviderError
from app.models import AnswerMode, PointType
from app.schemas.admin import (
    EcfRuleIn,
    MarkingSchemeIn,
    OptionIn,
    PaperIn,
    PointIn,
    QuestionIn,
    QuestionSchemeIn,
    RuleIn,
    SectionIn,
    TableIn,
)
from app.services.generator.blueprint import Blueprint, SectionPlan
from app.services.verify.checks import duplicate_of
from app.services.verify.facts import from_written
from app.services.verify.pipeline import verify_question
from app.services.verify.report import Finding, Severity, VerificationReport

logger = logging.getLogger(__name__)

MCQ_OPTIONS = 5
MCQ_KEY_CODE = "K"
POINT_TYPES = {t.value for t in PointType}
DEFAULT_ATTEMPTS = 2
MOST_ATTEMPTS = 5


@dataclass
class Generated:
    """A finished draft, a note of anything dropped, and what the checks found."""

    paper: PaperIn
    scheme: MarkingSchemeIn
    written_by: str
    kept: int = 0
    dropped: list[str] = field(default_factory=list)
    findings: list[Finding] = field(default_factory=list)
    checked_by: list[str] = field(default_factory=list)
    attempts: int = 1
    # Resource passages that were retrieved and shown to the model (SourceRef.as_dict
    # shape). The caller persists this on Paper.grounded_in; empty when no embedding
    # model is configured or nothing matched closely enough to be shown.
    sources: list[dict] = field(default_factory=list)

    @property
    def needs_teacher(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == Severity.TEACHER]


def generate(
    blueprint: Blueprint,
    author: QuestionAuthor,
    topic_lines: list[str],
    examples: dict[AnswerMode, list[str]] | None = None,
    resource_lines: list[str] | None = None,
    sources: list | None = None,
    *,
    critic: QuestionCritic | None = None,
    attempts: int = DEFAULT_ATTEMPTS,
) -> Generated:
    """Write every section of the paper, verify it, then assemble the draft.

    `sources` is not used while writing - it is carried straight through onto the
    result, so the caller's record of what was retrieved survives even though this
    function only needs `resource_lines`, the text of those same passages.
    """
    rounds = max(1, min(attempts, MOST_ATTEMPTS))
    sections: list[SectionIn] = []
    entries: list[QuestionSchemeIn] = []
    dropped: list[str] = []
    findings: list[Finding] = []
    asked: list[str] = []
    checks = VerificationReport()
    used = 0

    for plan in blueprint.sections:
        kept: list[WrittenQuestion] = []
        for attempt in range(rounds):
            if len(kept) >= plan.count:
                break
            used = max(used, attempt + 1)
            kept += _write_round(
                plan,
                author,
                topic_lines,
                examples,
                resource_lines,
                asked,
                kept,
                dropped,
                findings,
                checks,
                critic,
            )

        if kept:
            sections.append(_section(plan, kept[: plan.count], blueprint.topic_codes))
            entries.extend(_scheme_entries(plan, kept[: plan.count]))

    if not sections:
        # A paper needs at least one markable question. Saying why is more use than an
        # empty draft nobody can do anything with.
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
        findings=findings,
        checked_by=checks.checks_run,
        attempts=used or 1,
        sources=[source.as_dict() for source in (sources or [])],
    )


def _write_round(
    plan: SectionPlan,
    author: QuestionAuthor,
    topic_lines: list[str],
    examples: dict[AnswerMode, list[str]] | None,
    resource_lines: list[str] | None,
    asked: list[str],
    kept: list[WrittenQuestion],
    dropped: list[str],
    findings: list[Finding],
    checks: VerificationReport,
    critic: QuestionCritic | None,
) -> list[WrittenQuestion]:
    """Ask for the questions still missing from this section, and check what comes back."""
    wanted = plan.count - len(kept)
    brief = build_brief(
        answer_mode=plan.answer_mode.value,
        count=wanted,
        marks_each=plan.marks / plan.count,
        topics=topic_lines,
        avoid=asked,
        examples=(examples or {}).get(plan.answer_mode),
        resources=resource_lines,
    )
    try:
        written = author.write(brief)
    except Exception as error:  # network, quota, a busy model, or a reply that is not valid JSON
        # The provider's own message can carry request internals, so it is logged
        # here and the caller gets a fixed, safe one it can act on.
        logger.exception("Question author failed for section %s", plan.title)
        raise ProviderError(
            "The question writer is busy right now. Try again in a moment, "
            "or ask for fewer questions."
        ) from error

    accepted = []
    for question in written.questions[:wanted]:
        label = question.label or "?"
        shape = _unusable(question, plan)
        if shape:
            dropped.append(f"{plan.title} {label}: {shape}")
            continue

        # The model was told what it had already asked, which it does not always
        # honour. A repeat is dropped here rather than left to fail the saved scheme.
        if repeated := duplicate_of(question.text, [q.text for q in [*kept, *accepted]]):
            dropped.append(f"{plan.title} {label}: asks the same as '{repeated[:60]}'")
            continue

        facts = from_written(question, plan, len(kept) + len(accepted) + 1)
        report = verify_question(facts, critic)
        checks.merge(report)
        if report.rejected:
            reasons = "; ".join(finding.message for finding in report.errors)
            dropped.append(f"{plan.title} {label}: {reasons}")
            continue

        findings.extend(report.for_teacher)
        findings.extend(report.notes)
        accepted.append(question)
        asked.append(question.text[:120])
    return accepted


def _unusable(question: WrittenQuestion, plan: SectionPlan) -> str | None:
    """Why this question cannot be stored or marked at all, or None when it can.

    Only the shape is checked here. Whether the chemistry and the marks hold up is the
    verification pass's job, and it reports in more detail than one line.
    """
    if not question.text.strip():
        return "no question text"
    if not question.points:
        return "no marking points, so nothing could be marked"

    for point in question.points:
        if point.point_type not in POINT_TYPES:
            return f"unknown marking point type '{point.point_type}'"

    if question.table and any(len(row) != len(question.table.headers) for row in question.table.rows):
        return "table row(s) do not match its header count"

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
                table=TableIn(headers=question.table.headers, rows=question.table.rows)
                if question.table
                else None,
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
                    expected=_expected(plan, point),
                    alternatives=[a.strip() for a in point.alternatives if a.strip()],
                )
                for order, point in enumerate(question.points, start=1)
            ],
            rules=_rules(plan, question),
        )
        for number, question in enumerate(questions, start=1)
    ]


def _expected(plan: SectionPlan, point) -> dict | None:
    """What a checker can test this point against.

    For a multiple choice key that is the option label. For everything else it is
    whatever the model supplied: a value, a unit and the working behind the value.
    Without this a calculation could only ever be marked by the AI judge or a person.
    """
    if point.point_type == PointType.MCQ_KEY.value:
        return {"option": point.description.strip()}
    return point.expected_dict() if plan.answer_mode != AnswerMode.MCQ else None


def _rules(plan: SectionPlan, question: WrittenQuestion) -> list[RuleIn]:
    """The error-carried-forward rules, keeping only the ones that name real points."""
    if plan.answer_mode == AnswerMode.MCQ:
        return []
    codes = {_point_code(plan, p.code, order) for order, p in enumerate(question.points, start=1)}
    rules: list[RuleIn] = []
    for ecf in question.carried_forward:
        point = ecf.point.strip().upper()
        depends = [code.strip().upper() for code in ecf.depends_on]
        wanted = {point, *depends}
        if point and depends and wanted <= codes and point not in depends:
            rules.append(EcfRuleIn(rule_type="ecf", point=point, depends_on=depends))
    return rules


def _point_code(plan: SectionPlan, written: str, order: int) -> str:
    """Keep the model's code when it is sensible, otherwise number it ourselves."""
    if plan.answer_mode == AnswerMode.MCQ:
        return MCQ_KEY_CODE
    cleaned = written.strip().upper()[:20]
    return cleaned if cleaned else f"P{order}"
