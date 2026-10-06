"""Marking engine: decide every marking point of every answer, then total with the rules.

Each point is decided by the best available marker for its type:
- mcq_key  -> exact rule (this step)
- others   -> PENDING until the AI judge / chemistry checkers exist (next steps)

Totals are only calculated when nothing is pending, so a student never sees a
half-finished mark presented as final.
"""

from collections import defaultdict
from collections.abc import Callable

from app.models import (
    Answer,
    Attempt,
    AttemptStatus,
    MarkingMethod,
    MarkingPoint,
    MarkingRule,
    Paper,
    PointResult,
    PointStatus,
    PointType,
    Question,
    utcnow,
)
from app.services.marks import best_of, question_total


def mark_attempt(attempt: Attempt) -> None:
    points: dict[int, list[MarkingPoint]] = defaultdict(list)
    for point in attempt.scheme.points:
        points[point.question_id].append(point)
    rules: dict[int, list[MarkingRule]] = defaultdict(list)
    for rule in attempt.scheme.rules:
        rules[rule.question_id].append(rule)

    for answer in attempt.answers:
        answer.point_results = [_judge(point, answer) for point in points[answer.question_id]]
        answer.score = _answer_score(answer, rules[answer.question_id])

    if all(answer.score is not None for answer in attempt.answers):
        attempt.score = _paper_score(attempt)
        attempt.status = AttemptStatus.MARKED
        attempt.marked_at = utcnow()


def paper_max_score(paper: Paper) -> float:
    return _sum_sections(paper, lambda question: question.max_marks or 0.0)


def _judge(point: MarkingPoint, answer: Answer) -> PointResult:
    if point.point_type == PointType.MCQ_KEY:
        return _judge_mcq(point, answer)
    return PointResult(point=point, status=PointStatus.PENDING, awarded=0.0)


def _judge_mcq(point: MarkingPoint, answer: Answer) -> PointResult:
    key = point.expected["option"]
    correct = answer.mcq_option == key
    return PointResult(
        point=point,
        status=PointStatus.AWARDED if correct else PointStatus.NOT_AWARDED,
        awarded=point.marks if correct else 0.0,
        method=MarkingMethod.RULE,
        evidence=f"Chose option {answer.mcq_option}; correct option is {key}",
        confidence=1.0,
    )


def _answer_score(answer: Answer, rules: list[MarkingRule]) -> float | None:
    if any(result.status == PointStatus.PENDING for result in answer.point_results):
        return None
    return question_total({result.point.code: result.awarded for result in answer.point_results}, rules)


def _paper_score(attempt: Attempt) -> float:
    scores = {answer.question_id: answer.score or 0.0 for answer in attempt.answers}
    return _sum_sections(
        attempt.paper,
        lambda question: sum(scores.get(leaf.id, 0.0) for leaf in question.walk() if not leaf.sub_questions),
    )


def _sum_sections(paper: Paper, question_value: Callable[[Question], float]) -> float:
    """Add up top-level question values per section (only the best N where it says "answer N")."""
    return sum(
        best_of(
            [question_value(q) for q in section.questions if q.parent is None],
            section.choose_count,
        )
        for section in paper.sections
    )
