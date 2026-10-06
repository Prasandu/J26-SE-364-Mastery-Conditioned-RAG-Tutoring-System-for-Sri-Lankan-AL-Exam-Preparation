"""Marking engine: decide every marking point of every answer, then total with the rules.

Who decides a point:
- mcq_key        -> exact rule, at submit time
- diagram/graph  -> teacher (cannot be judged from typed text)
- everything else-> AI judge, after submit (stays PENDING until then)

An AI decision only counts if code can confirm it: the quoted evidence must really
be in the student's answer, and the AI must be confident enough. Otherwise the
point is NEEDS_REVIEW (for a teacher).

Totals are only calculated when every point is final, so a student never sees a
half-finished mark presented as final.
"""

from collections import defaultdict
from collections.abc import Callable, Iterable

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
    RuleType,
    utcnow,
)
from app.services.judge import AnswerJudge, JudgeRequest, PointToJudge, PointVerdict
from app.services.marks import best_of, question_total

FINAL_STATUSES = {PointStatus.AWARDED, PointStatus.NOT_AWARDED}
TEACHER_ONLY_TYPES = {PointType.DIAGRAM, PointType.GRAPH}
MCQ_KEY_MARKER = "mcq-key"


# ---------- Public ----------


def mark_attempt(attempt: Attempt) -> None:
    """First pass at submit time: rule-based points are decided, the rest wait."""
    points = _by_question(attempt.scheme.points)
    for answer in attempt.answers:
        answer.point_results = [_first_pass(point, answer) for point in points[answer.question_id]]
    refresh_scores(attempt)


def judge_answer(answer: Answer, judge: AnswerJudge, min_confidence: float) -> None:
    """Ask the AI judge about this answer's pending points, and apply its verdicts with checks."""
    pending = [result for result in answer.point_results if result.status == PointStatus.PENDING]
    if not pending:
        return
    verdicts = {v.code: v for v in judge.judge(_judge_request(answer, [r.point for r in pending]))}
    for result in pending:
        _apply_verdict(result, verdicts.get(result.point.code), answer.text or "", judge.name, min_confidence)


def has_pending(attempt: Attempt) -> bool:
    return any(r.status == PointStatus.PENDING for a in attempt.answers for r in a.point_results)


def refresh_scores(attempt: Attempt) -> None:
    rules = _by_question(attempt.scheme.rules)
    for answer in attempt.answers:
        answer.score = _answer_score(answer, rules[answer.question_id])

    if attempt.status != AttemptStatus.IN_PROGRESS and all(a.score is not None for a in attempt.answers):
        attempt.score = _paper_score(attempt)
        attempt.status = AttemptStatus.MARKED
        attempt.marked_at = utcnow()


def paper_max_score(paper: Paper) -> float:
    return _sum_sections(paper, lambda question: question.max_marks or 0.0)


def quote_in_answer(quote: str | None, answer_text: str) -> bool:
    """True if the AI's quote really appears in the answer (ignoring case, spacing and edge punctuation)."""

    def normalize(text: str) -> str:
        return " ".join(text.lower().split())

    cleaned = normalize((quote or "").strip(" \"'.,;:"))
    return bool(cleaned) and cleaned in normalize(answer_text)


# ---------- First pass ----------


def _first_pass(point: MarkingPoint, answer: Answer) -> PointResult:
    if point.point_type == PointType.MCQ_KEY:
        return _judge_mcq(point, answer)
    if point.point_type in TEACHER_ONLY_TYPES:
        return PointResult(
            point=point,
            status=PointStatus.NEEDS_REVIEW,
            awarded=0.0,
            reason="Diagrams and graphs in typed answers are marked by a teacher",
        )
    return PointResult(point=point, status=PointStatus.PENDING, awarded=0.0)


def _judge_mcq(point: MarkingPoint, answer: Answer) -> PointResult:
    key = point.expected["option"]
    correct = answer.mcq_option == key
    return PointResult(
        point=point,
        status=PointStatus.AWARDED if correct else PointStatus.NOT_AWARDED,
        awarded=point.marks if correct else 0.0,
        method=MarkingMethod.RULE,
        marker=MCQ_KEY_MARKER,
        evidence=f"Chose option {answer.mcq_option}; correct option is {key}",
        confidence=1.0,
    )


# ---------- AI judge ----------


def _judge_request(answer: Answer, points: list[MarkingPoint]) -> JudgeRequest:
    scheme = answer.attempt.scheme
    question = answer.question
    ecf_rules = [
        r
        for r in scheme.rules
        if r.question_id == question.id and r.rule_type == RuleType.ERROR_CARRIED_FORWARD
    ]
    return JudgeRequest(
        question=_question_with_context(question),
        model_answer=next(
            (m.answer_text for m in scheme.model_answers if m.question_id == question.id), None
        ),
        points=[
            PointToJudge(
                code=p.code,
                description=p.description,
                marks=p.marks,
                point_type=p.point_type.value,
                alternatives=p.alternatives,
                expected=p.expected,
            )
            for p in points
        ],
        carried_forward=[
            f"{r.params['point']} may be awarded using the student's own earlier result from "
            f"{', '.join(r.params['depends_on'])}, even if that earlier result was wrong."
            for r in ecf_rules
        ],
        student_answer=answer.text or "",
    )


def _question_with_context(question: Question) -> str:
    """Parent question text first, e.g. the titration set-up before part (b)."""
    chain = []
    current: Question | None = question
    while current is not None:
        chain.append(f"{current.full_label}: {current.text}")
        current = current.parent
    return "\n".join(reversed(chain))


def _apply_verdict(
    result: PointResult, verdict: PointVerdict | None, answer_text: str, marker: str, min_confidence: float
) -> None:
    result.method = MarkingMethod.LLM
    result.marker = marker
    if verdict is None:
        result.status = PointStatus.NEEDS_REVIEW
        result.reason = "The AI judge gave no decision for this point"
        return

    result.confidence = min(max(verdict.confidence, 0.0), 1.0)
    result.awarded = result.point.marks if verdict.awarded else 0.0  # AI suggestion, final only if trusted
    result.evidence = verdict.evidence_quote
    result.reason = verdict.reason

    if verdict.awarded and not quote_in_answer(verdict.evidence_quote, answer_text):
        result.status = PointStatus.NEEDS_REVIEW
        result.reason = f"AI evidence was not found in the answer. AI said: {verdict.reason}"
    elif result.confidence < min_confidence:
        result.status = PointStatus.NEEDS_REVIEW
    else:
        result.status = PointStatus.AWARDED if verdict.awarded else PointStatus.NOT_AWARDED


# ---------- Totals ----------


def _answer_score(answer: Answer, rules: list[MarkingRule]) -> float | None:
    if any(result.status not in FINAL_STATUSES for result in answer.point_results):
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


def _by_question[T: (MarkingPoint, MarkingRule)](items: Iterable[T]) -> dict[int, list[T]]:
    grouped: dict[int, list[T]] = defaultdict(list)
    for item in items:
        grouped[item.question_id].append(item)
    return grouped
