"""Content rules for papers and marking schemes.

Every check returns a list of problems in plain English (empty list = OK), so an
admin sees all mistakes at once instead of fixing them one by one.

Two levels:
- check_paper / check_scheme:      structure, checked on every save (drafts too)
- check_paper_ready / check_scheme_ready: completeness, checked before publishing
"""

from collections import Counter, defaultdict
from collections.abc import Hashable, Iterable, Iterator, Mapping
from math import isclose

from app.models import AnswerMode, ContentStatus, MarkingScheme, Paper, PointType, Question
from app.schemas.admin import (
    AnyNOfRuleIn,
    EcfRuleIn,
    MarkingSchemeIn,
    PaperIn,
    PointIn,
    QuestionIn,
    RuleIn,
    SectionIn,
)
from app.services.chemistry.checkers import GRAPH_CHECKS
from app.services.marks import question_total

QuestionRef = tuple[str, str]  # (section code, full label), e.g. ("II-A", "1(b)")


def _duplicates[T: Hashable](values: Iterable[T]) -> list[T]:
    return [value for value, count in Counter(values).items() if count > 1]


def _where(section_code: str, label: str) -> str:
    return f"Section {section_code} Q{label}"


# Papers


def check_paper(data: PaperIn, known_topics: set[str]) -> list[str]:
    errors = [
        f"Section code '{code}' is used more than once" for code in _duplicates(s.code for s in data.sections)
    ]
    for section in data.sections:
        errors += _check_section(section, known_topics)
    return errors


def _walk_input(questions: list[QuestionIn], prefix: str = "") -> Iterator[tuple[str, QuestionIn]]:
    for question in questions:
        label = prefix + question.label
        yield label, question
        yield from _walk_input(question.sub_questions, label)


def _check_section(section: SectionIn, known_topics: set[str]) -> list[str]:
    labelled = list(_walk_input(section.questions))
    errors = [
        f"Section {section.code}: question '{label}' appears more than once"
        for label in _duplicates(label for label, _ in labelled)
    ]
    if section.choose_count and section.choose_count > len(section.questions):
        errors.append(
            f"Section {section.code}: choose_count is {section.choose_count} "
            f"but there are only {len(section.questions)} questions"
        )
    for label, question in labelled:
        errors += _check_question(_where(section.code, label), question, section.answer_mode, known_topics)
    return errors


def _check_question(where: str, question: QuestionIn, mode: AnswerMode, known_topics: set[str]) -> list[str]:
    errors = []
    if mode == AnswerMode.MCQ:
        if question.sub_questions:
            errors.append(f"{where}: MCQ questions cannot have sub-questions")
        if not question.options or len(question.options) < 2:
            errors.append(f"{where}: MCQ questions need at least 2 options")
        elif duplicated := _duplicates(option.label for option in question.options):
            errors.append(f"{where}: option label(s) {', '.join(duplicated)} used more than once")
    elif question.options is not None:
        errors.append(f"{where}: options are only allowed in MCQ sections")

    if unknown := sorted(set(question.topics) - known_topics):
        errors.append(f"{where}: unknown topic(s) {', '.join(unknown)}")

    sub_marks = [sub.max_marks for sub in question.sub_questions]
    if question.max_marks is not None and sub_marks and None not in sub_marks:
        total = sum(sub_marks)
        if not isclose(total, question.max_marks):
            errors.append(
                f"{where}: sub-question marks add up to {total:g} "
                f"but the question is worth {question.max_marks:g}"
            )
    return errors


def check_paper_ready(paper: Paper) -> list[str]:
    errors = _check_leaf_marks(paper)
    if not any(scheme.status == ContentStatus.PUBLISHED for scheme in paper.marking_schemes):
        errors.append("Publish a marking scheme for this paper first")
    return errors


def _check_leaf_marks(paper: Paper) -> list[str]:
    return [
        f"{_where(q.section.code, q.full_label)}: needs max_marks"
        for q in paper.iter_questions()
        if not q.sub_questions and q.max_marks is None
    ]


# Marking schemes


def check_scheme(data: MarkingSchemeIn, questions: Mapping[QuestionRef, Question]) -> list[str]:
    errors = [
        f"{_where(*ref)} appears more than once"
        for ref in _duplicates((entry.section, entry.question) for entry in data.questions)
    ]
    for entry in data.questions:
        where = _where(entry.section, entry.question)
        question = questions.get((entry.section, entry.question))
        if question is None:
            errors.append(f"{where}: no such question in this paper")
            continue
        if question.sub_questions and (entry.points or entry.rules):
            errors.append(f"{where}: put marking points on its sub-questions, not on the main question")
        errors += _check_points(where, entry.points, question)
        errors += _check_rules(where, entry.rules, {point.code for point in entry.points})
    return errors


def _check_points(where: str, points: list[PointIn], question: Question) -> list[str]:
    errors = [
        f"{where}: point code '{code}' is used more than once" for code in _duplicates(p.code for p in points)
    ]

    keys = [p for p in points if p.point_type == PointType.MCQ_KEY]
    if question.section.answer_mode == AnswerMode.MCQ:
        option_labels = sorted(option["label"] for option in question.options or [])
        if len(points) != 1 or len(keys) != 1:
            errors.append(f"{where}: an MCQ question needs exactly one mcq_key point")
        else:
            # alternatives: other options the scheme accepts as equally correct, e.g. "4/5".
            key = keys[0]
            option = (key.expected or {}).get("option")
            if option is None:
                errors.append(f"{where}: mcq_key needs an expected.option")
            elif unknown := sorted({option, *key.alternatives} - set(option_labels)):
                valid = ", ".join(option_labels)
                errors.append(f"{where}: mcq_key option(s) {', '.join(unknown)} must be one of {valid}")
    elif keys:
        errors.append(f"{where}: mcq_key points are only for MCQ questions")

    errors += [
        f'{where} {point.code}: a graph point\'s expected needs "check" to be one of '
        f"{', '.join(GRAPH_CHECKS)}"
        for point in points
        if point.point_type == PointType.GRAPH
        and point.expected is not None
        and point.expected.get("check") not in GRAPH_CHECKS
    ]
    errors += [
        f"{where} {point.code}: a calculation's expected needs a numeric 'value'"
        for point in points
        if point.point_type == PointType.CALCULATION
        and point.expected is not None
        and not _is_number(point.expected.get("value"))
    ]
    return errors


def _is_number(value: object) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)  # bool is a subclass of int


def _check_rules(where: str, rules: list[RuleIn], codes: set[str]) -> list[str]:
    errors = []
    if sum(rule.rule_type == "max_marks" for rule in rules) > 1:
        errors.append(f"{where}: only one max_marks rule is allowed")

    grouped: set[str] = set()
    for rule in rules:
        match rule:
            case AnyNOfRuleIn(n=n, points=group):
                errors += _unknown_points(where, group, codes)
                if n >= len(group):
                    errors.append(f"{where}: any_n_of n={n} must be smaller than its {len(group)} points")
                if overlap := sorted(grouped & set(group)):
                    errors.append(
                        f"{where}: point(s) {', '.join(overlap)} are in more than one any_n_of group"
                    )
                grouped |= set(group)
            case EcfRuleIn(point=point, depends_on=depends_on):
                errors += _unknown_points(where, [point, *depends_on], codes)
                if point in depends_on:
                    errors.append(f"{where}: ecf point {point} cannot depend on itself")
    return errors


def _unknown_points(where: str, referenced: list[str], codes: set[str]) -> list[str]:
    unknown = sorted(set(referenced) - codes)
    return [f"{where}: rule refers to unknown point(s) {', '.join(unknown)}"] if unknown else []


def check_scheme_ready(scheme: MarkingScheme) -> list[str]:
    """Every marked question has points, and a perfect answer gets exactly the question's marks."""
    errors = _check_leaf_marks(scheme.paper)

    points: dict[int, dict[str, float]] = defaultdict(dict)
    for point in scheme.points:
        points[point.question_id][point.code] = point.marks
    rules = defaultdict(list)
    for rule in scheme.rules:
        rules[rule.question_id].append(rule)

    for question in scheme.paper.iter_questions():
        if question.sub_questions or question.max_marks is None:
            continue
        where = _where(question.section.code, question.full_label)
        if not points[question.id]:
            errors.append(f"{where}: has no marking points")
            continue
        best = question_total(points[question.id], rules[question.id])
        if not isclose(best, question.max_marks):
            errors.append(
                f"{where}: a perfect answer would get {best:g} marks "
                f"but the question is worth {question.max_marks:g}"
            )
    return errors
