"""The deterministic validators. Each one is narrow on purpose.

Every check here is repeatable: the same question gives the same findings every time,
with no model involved. That is what makes a finding evidence rather than an opinion.

What each check can prove, and what it cannot:

check_marks          the marking points add up to the question's marks. Pure arithmetic.
                     Cannot tell whether the split between the points is sensible.
check_information    the question contains numbers for a calculation, has no blanks
                     left in it, and does not point at a diagram that cannot be shown.
                     Cannot tell whether a chemistry question is answerable.
check_numbers        the stated answer really is what the stated working produces,
                     recomputed with Decimal. Skipped when no working was given, which
                     proves nothing either way.
check_units          the unit is one pint understands, and a value's unit measures what
                     the quantity should. Cannot tell whether it is the right unit for
                     the chemistry.
check_equations      the atoms and charge balance on both sides. Cannot tell whether
                     the reaction is real or the products would form.
check_notation       the formulas are made of real element symbols. Catches NaCL for
                     NaCl. Cannot catch a valid formula that is the wrong substance.
check_ambiguity      two options that say the same thing, a key matching more than one
                     option, a multiple choice stem asking for discussion.
check_duplicates     two questions in the same paper that are the same question.
                     Compares words, so a reworded duplicate can still get through.

None of this checks that the chemistry is correct. A question can pass every check
here and still be wrong, which is why a teacher approves a scheme before it counts.
"""

import re
from collections.abc import Sequence
from math import isclose

from app.models import PointType
from app.services.chemistry.arithmetic import DEFAULT_TOLERANCE_PCT, agrees, evaluate
from app.services.chemistry.equations import (
    check_balance,
    extract_equation,
    looks_like_equation,
    unreadable_formulas,
)
from app.services.chemistry.notation import normalize
from app.services.chemistry.quantities import Match, as_pint, compare, parse_quantities
from app.services.marks import question_total
from app.services.verify.facts import PointFacts, QuestionFacts
from app.services.verify.report import Finding, error, for_teacher, note

SHORTEST_QUESTION = 15
# Two questions counted as the same when this much of their wording is shared.
DUPLICATE_OVERLAP = 0.8
# Or when one question contains almost all of the other, which is how a model repeats
# itself: the same question again with an extra sentence on the end.
DUPLICATE_CONTAINMENT = 0.9
CONTAINMENT_NEEDS_WORDS = 8
SMALLEST_COMPARED = 4  # words; below this, overlap means nothing

_BLANKS = re.compile(r"_{3,}|\[\s*(?:insert|fill|todo|tbd)\b|\bTBD\b|\bXXX\b", re.I)
_REFERS_TO_PICTURE = re.compile(
    r"\b(?:shown|given|above|below|following)\b[^.]{0,30}\b(?:diagram|figure|graph|table|scheme|image)\b"
    r"|\b(?:diagram|figure|graph|table|image)\b[^.]{0,20}\b(?:above|below|shown|given)\b",
    re.I,
)
_DISCUSSION_WORDS = re.compile(r"\b(?:discuss|comment on|explain why|describe how|justify)\b", re.I)
_HAS_DIGIT = re.compile(r"\d")
_WORDS = re.compile(r"[a-z0-9]+")


def check_marks(facts: QuestionFacts) -> list[Finding]:
    """A perfect answer earns exactly the question's marks, and no point is worth zero.

    The total goes through the same rule engine that marks the question, so a question
    with an "any 2 of 3" rule is judged on what a student could actually score, not on
    the sum of every point written down.
    """
    findings = [
        error("marks", facts.at(point), f"is worth {point.marks:g} marks")
        for point in facts.points
        if point.marks <= 0
    ]
    if not facts.points:
        return [error("marks", facts.where, "has no marking points, so nothing could be marked")]

    total = question_total({point.code: point.marks for point in facts.points}, facts.rules)
    if not isclose(total, facts.max_marks):
        findings.append(
            error(
                "marks",
                facts.where,
                f"marking points add up to {total:g}, not {facts.max_marks:g}",
            )
        )

    seen: set[str] = set()
    for point in facts.points:
        if point.code in seen:
            findings.append(error("marks", facts.where, f"point code {point.code} is used twice"))
        seen.add(point.code)
    return findings


def check_information(facts: QuestionFacts) -> list[Finding]:
    """Is there enough in the question to answer it at all?"""
    findings = []
    text = facts.text.strip()
    if len(text) < SHORTEST_QUESTION:
        findings.append(error("information", facts.where, "the question text is too short to answer"))
    if _BLANKS.search(text):
        findings.append(error("information", facts.where, "the question still has a blank left in it"))
    if _REFERS_TO_PICTURE.search(text):
        findings.append(
            error(
                "information",
                facts.where,
                "it refers to a diagram, figure, graph or table, and none can be shown",
            )
        )

    calculations = [p for p in facts.points if p.point_type == PointType.CALCULATION.value]
    if calculations and not _HAS_DIGIT.search(text):
        findings.append(
            error(
                "information",
                facts.where,
                "it asks for a calculation but gives no numbers to calculate from",
            )
        )

    if facts.is_mcq:
        findings += _check_options_present(facts)
    if not facts.model_answer:
        findings.append(for_teacher("information", facts.where, "has no model answer"))
    return findings


def _check_options_present(facts: QuestionFacts) -> list[Finding]:
    findings = []
    if not facts.options:
        findings.append(error("information", facts.where, "a multiple choice question with no options"))
    findings += [
        error("information", facts.where, f"option {label or '?'} has no text")
        for label, text in facts.options
        if not text.strip()
    ]
    return findings


def check_numbers(facts: QuestionFacts) -> tuple[list[Finding], bool]:
    """Recompute every stated answer from its stated working.

    The flag says whether anything was actually recomputed. A question whose points
    carry no working has not been checked, and the report has to say so.
    """
    findings: list[Finding] = []
    recomputed = False

    for point in facts.points:
        value, working = point.expected_value, point.working
        if working is None:
            continue
        if value is None:
            findings.append(
                for_teacher("numbers", facts.at(point), "has working but no value to compare it with")
            )
            continue

        verdict = agrees(working, value, DEFAULT_TOLERANCE_PCT)
        if verdict is None:
            findings.append(
                note(
                    "numbers",
                    facts.at(point),
                    f"the working '{working}' is not arithmetic this checker can redo",
                )
            )
            continue

        recomputed = True
        if not verdict:
            computed = evaluate(working)
            findings.append(
                error(
                    "numbers",
                    facts.at(point),
                    f"the working '{working}' comes to {computed}, not the stated {value:g}",
                )
            )

    findings += _check_model_answer_values(facts)
    return findings, recomputed


def _check_model_answer_values(facts: QuestionFacts) -> list[Finding]:
    """Does the model answer actually contain the number the scheme expects?"""
    answer = facts.model_answer
    if not answer:
        return []

    findings = []
    quantities = parse_quantities(normalize(answer))
    for point in facts.points:
        value = point.expected_value
        if value is None:
            continue
        if not quantities:
            findings.append(
                for_teacher(
                    "numbers", facts.at(point), "the model answer has no number in it to check against"
                )
            )
            continue
        result, _ = compare(quantities, value, point.expected_unit, DEFAULT_TOLERANCE_PCT)
        if result == Match.NONE:
            findings.append(
                error(
                    "numbers",
                    facts.at(point),
                    f"the model answer does not contain the expected value {value:g}",
                )
            )
    return findings


def check_units(facts: QuestionFacts) -> list[Finding]:
    """Every unit the scheme names must be one pint can read."""
    findings = []
    for point in facts.points:
        unit = point.expected_unit
        if unit and as_pint(unit) is None:
            findings.append(error("units", facts.at(point), f"'{unit}' is not a unit this system can read"))
        if point.point_type == PointType.UNIT.value and not unit:
            findings.append(
                error("units", facts.at(point), "a unit point has to say which unit earns the mark")
            )
    return findings


def check_equations(facts: QuestionFacts) -> list[Finding]:
    """Balance every equation written in the model answer or in an equation point."""
    findings = []
    for where, text in _equation_sources(facts):
        for line in _equation_lines(text):
            report = check_balance(line)
            if not report.readable:
                findings.append(note("equation-balance", where, f"'{line}' {report.explain().lower()}"))
            elif not report.balanced:
                findings.append(error("equation-balance", where, f"'{line}' {report.explain().lower()}"))
    return findings


def _equation_sources(facts: QuestionFacts) -> list[tuple[str, str]]:
    sources = [(facts.where, facts.model_answer or "")]
    sources += [
        (facts.at(point), point.description)
        for point in facts.points
        if point.point_type == PointType.EQUATION.value
    ]
    sources += [
        (facts.at(point), alternative) for point in facts.points for alternative in point.alternatives
    ]
    return sources


def _equation_lines(text: str) -> list[str]:
    """Every equation in the text, lifted out of any prose around it."""
    found = []
    for line in normalize(text).splitlines():
        if not looks_like_equation(line):
            continue
        equation = extract_equation(line)
        # Nothing could be pulled out, so hand the whole line over and let the balance
        # checker report it as unreadable rather than guessing.
        found.append(equation or line.strip())
    return found


def check_notation(facts: QuestionFacts) -> list[Finding]:
    """Catch formulas that are not made of element symbols, e.g. NaCL."""
    findings = []
    places: list[tuple[str, str]] = [(facts.where, facts.text), (facts.where, facts.model_answer or "")]
    places += [(label, text) for label, text in facts.options]
    places += [(facts.at(point), point.description) for point in facts.points]

    reported: set[str] = set()
    for where, text in places:
        for bad in unreadable_formulas(normalize(text)):
            if bad in reported:
                continue
            reported.add(bad)
            # An option label is not a place, so anything found there is reported
            # against the question itself.
            place = where if where.startswith("Section") else facts.where
            findings.append(error("notation", place, f"'{bad}' is not a formula"))
    return findings


def check_ambiguity(facts: QuestionFacts) -> list[Finding]:
    """Questions with more than one defensible answer."""
    if not facts.is_mcq:
        return []

    findings = []
    seen: dict[str, str] = {}
    for label, text in facts.options:
        key = _comparable(text)
        if key and key in seen:
            findings.append(
                error("ambiguity", facts.where, f"options {seen[key]} and {label} say the same thing")
            )
        seen[key] = label

    keys = [p for p in facts.points if p.point_type == PointType.MCQ_KEY.value]
    for point in keys:
        accepted = {point.description.strip(), *(a.strip() for a in point.alternatives)}
        labels = {label for label, _ in facts.options}
        if len(accepted & labels) > 1:
            findings.append(
                error("ambiguity", facts.at(point), "more than one option is marked as the answer")
            )

    if _DISCUSSION_WORDS.search(facts.text):
        findings.append(
            for_teacher(
                "ambiguity", facts.where, "a multiple choice question that asks for discussion is unclear"
            )
        )
    return findings


def check_duplicates(facts: Sequence[QuestionFacts]) -> list[Finding]:
    """Two questions in one paper that are really the same question."""
    findings = []
    words = [(one, _word_set(one.text)) for one in facts]
    for index, (question, mine) in enumerate(words):
        for other, theirs in words[:index]:
            if _same_question(mine, theirs):
                findings.append(error("duplicate", question.where, f"asks the same as {other.where}"))
                break
    return findings


def duplicate_of(text: str, already: Sequence[str]) -> str | None:
    """The first earlier question this one repeats, or None.

    Used while a paper is being written, so a repeat is dropped at the gate rather
    than failing the whole scheme once it is saved.
    """
    mine = _word_set(text)
    return next((other for other in already if _same_question(mine, _word_set(other))), None)


def _same_question(left: set[str], right: set[str]) -> bool:
    """Do these two sets of words belong to the same question?"""
    if len(left) < SMALLEST_COMPARED or len(right) < SMALLEST_COMPARED:
        return False
    shared = len(left & right)
    if shared / len(left | right) >= DUPLICATE_OVERLAP:
        return True
    smaller = min(len(left), len(right))
    return smaller >= CONTAINMENT_NEEDS_WORDS and shared / smaller >= DUPLICATE_CONTAINMENT


def _word_set(text: str) -> set[str]:
    return set(_WORDS.findall(text.casefold()))


def _comparable(text: str) -> str:
    return " ".join(_WORDS.findall(normalize(text).casefold()))


def point_is_checkable(point: PointFacts) -> bool:
    """True when code could decide this point at marking time, not just at review."""
    if point.point_type == PointType.CALCULATION.value:
        return point.expected_value is not None
    if point.point_type == PointType.UNIT.value:
        return point.expected_unit is not None
    return point.point_type == PointType.MCQ_KEY.value
