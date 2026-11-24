"""The verification pass: one question in, a report out.

The stages run in a fixed order, cheapest and most certain first, so a question that
is plainly broken never reaches the expensive stage:

1. schema          Pydantic already did this when the reply was parsed
2. marks           the points add up to the question's marks
3. information     there is enough in the question to answer it
4. numbers         every stated answer is recomputed from its stated working
5. units           the units are readable and measure the right thing
6. equations       the atoms and the charge balance
7. notation        the formulas are made of real element symbols
8. ambiguity       no two options say the same thing
9. critique        optional: a model reads the question and the scheme
10. compare        anything only the model objected to becomes a teacher's decision

Stages 2 to 8 are deterministic. Stage 9 is not, and stage 10 exists precisely to stop
it being treated as if it were: a critique on its own can never reject a question, only
refer it. Where the critique and a deterministic check disagree, the deterministic
check wins, because it is the one that can be rerun and shown to be right.

Duplicate detection runs across the whole paper rather than per question, so it lives
in `verify_paper`.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from app.ai.critic import Critique, QuestionCritic, build_critique_brief
from app.services.verify.checks import (
    check_ambiguity,
    check_duplicates,
    check_equations,
    check_information,
    check_marks,
    check_notation,
    check_numbers,
    check_units,
)
from app.services.verify.facts import QuestionFacts
from app.services.verify.report import VerificationReport, for_teacher, note

# A provider failure must not stop a paper being generated, so the critique is
# best-effort. The exceptions are deliberately broad: a client library can raise
# anything, and none of it means the question is wrong.
CRITIQUE_CHECK = "ai-critique"
DETERMINISTIC_CHECKS = (
    "marks",
    "information",
    "numbers",
    "units",
    "equation-balance",
    "notation",
    "ambiguity",
)


@dataclass(frozen=True)
class Verified:
    """One question and what the pass made of it."""

    facts: QuestionFacts
    report: VerificationReport

    @property
    def usable(self) -> bool:
        return not self.report.rejected


def verify_question(facts: QuestionFacts, critic: QuestionCritic | None = None) -> VerificationReport:
    """Run every stage on one question."""
    report = VerificationReport()

    report.add(check_marks(facts))
    report.ran("marks")

    report.add(check_information(facts))
    report.ran("information")

    number_findings, recomputed = check_numbers(facts)
    report.add(number_findings)
    report.ran("numbers", skipped=not recomputed)

    report.add(check_units(facts))
    report.ran("units")

    report.add(check_equations(facts))
    report.ran("equation-balance")

    report.add(check_notation(facts))
    report.ran("notation")

    report.add(check_ambiguity(facts))
    report.ran("ambiguity")

    if critic is not None:
        _add_critique(facts, critic, report)
    else:
        report.ran(CRITIQUE_CHECK, skipped=True)

    return report


def verify_paper(questions: Sequence[QuestionFacts], critic: QuestionCritic | None = None) -> list[Verified]:
    """Every question of a paper, plus the checks that only make sense across the paper."""
    verified = [Verified(facts, verify_question(facts, critic)) for facts in questions]

    by_where = {one.facts.where: one for one in verified}
    for finding in check_duplicates([one.facts for one in verified]):
        if found := by_where.get(finding.where):
            found.report.add([finding])
    for one in verified:
        one.report.ran("duplicate")

    return verified


def _add_critique(facts: QuestionFacts, critic: QuestionCritic, report: VerificationReport) -> None:
    """Ask the critic, then fold its answer in at the weakest strength it deserves."""
    try:
        critique = critic.critique(_brief(facts))
    except Exception as cause:  # noqa: BLE001 - any client failure, and none of them are evidence
        report.add([note(CRITIQUE_CHECK, facts.where, f"the critic could not be reached ({cause})")])
        report.ran(CRITIQUE_CHECK, skipped=True)
        return

    report.ran(CRITIQUE_CHECK)
    report.add(_compare(facts, critique, report, critic.name))


def _compare(facts: QuestionFacts, critique: Critique, report: VerificationReport, critic_name: str) -> list:
    """What the critique adds, once the deterministic checks have had their say.

    An issue the deterministic checks already found adds nothing: it is recorded as a
    note so the agreement can be reported, and the existing error stands. An issue only
    the model raised goes to a teacher. A model saying everything is fine is recorded
    and changes nothing at all.
    """
    if critique.sound and not critique.issues:
        return [
            note(
                CRITIQUE_CHECK,
                facts.where,
                f"{critic_name} found no problem, which is not proof that there is none",
            )
        ]

    already = {finding.where for finding in report.findings}
    findings = []
    for issue in critique.issues:
        where = _place(facts, issue.where)
        if where in already:
            findings.append(
                note(CRITIQUE_CHECK, where, f"{critic_name} agrees something is wrong here: {issue.problem}")
            )
        else:
            findings.append(
                for_teacher(
                    CRITIQUE_CHECK,
                    where,
                    f"{critic_name} says: {issue.problem}. No deterministic check could confirm it.",
                )
            )
    return findings


def _place(facts: QuestionFacts, where: str) -> str:
    """Turn the critic's own words for a place into one of ours, where it names a point."""
    wanted = where.strip().upper()
    for point in facts.points:
        if point.code.upper() == wanted:
            return facts.at(point)
    return facts.where


def _brief(facts: QuestionFacts) -> str:
    return build_critique_brief(
        question=facts.text,
        answer_mode=facts.answer_mode.value,
        max_marks=facts.max_marks,
        options=facts.options,
        model_answer=facts.model_answer,
        points=[
            {
                "code": point.code,
                "description": point.description,
                "marks": point.marks,
                "point_type": point.point_type,
                "expected": point.expected,
                "alternatives": point.alternatives,
            }
            for point in facts.points
        ],
    )
