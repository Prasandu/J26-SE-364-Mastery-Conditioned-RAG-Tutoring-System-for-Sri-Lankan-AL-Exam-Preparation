"""Marking engine: decide every marking point of every answer, then total with the rules.

Who decides a point:
- mcq_key          -> exact rule, at submit time
- diagram          -> AI vision judge if configured (stricter confidence), else teacher
- graph            -> chemistry checker when the student plotted it as data, else same as diagram
- chemistry checker-> exact code check (calculations, units, graphs), at submit time
- everything else  -> AI judge, after submit (stays PENDING until then)

With AI_CROSS_CHECK on, a point the checker decided is also sent to the AI judge, which is
never told what the checker said. Two independent markers agreeing is strong evidence; when
they disagree the point goes to a teacher instead of silently trusting one of them.

An AI decision only counts if code can confirm it: the quoted evidence must really
be in the student's answer, and the AI must be confident enough. Otherwise the
point is NEEDS_REVIEW (for a teacher).

Totals are only calculated when every point is final, so a student never sees a
half-finished mark presented as final.
"""

from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass

from app.ai.judge import AnswerJudge, JudgeRequest, PointToJudge, PointVerdict
from app.ai.vision import Image
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
from app.services.chemistry.checkers import CHECKER_NAME, StudentAnswer, check_point
from app.services.chemistry.graphs import GraphAnswer
from app.services.drawing_judge import DrawingJudge, DrawingVerdict
from app.services.marks import best_of, question_total
from app.services.storage import FileStore

FINAL_STATUSES = {PointStatus.AWARDED, PointStatus.NOT_AWARDED}
MCQ_KEY_MARKER = "mcq-key"


# Public


def mark_attempt(attempt: Attempt, cross_check: bool = False, drawing_judge_available: bool = False) -> None:
    """First pass at submit time: rule-based points are decided, the rest wait.

    drawing_judge_available: whether a vision judge is configured to look at a
    drawing point's photo later (see judge_answer). When it is not, a drawing point
    is sent straight to a teacher here, same as before this existed, instead of
    waiting on a background pass that will never resolve it.
    """
    points = _by_question(attempt.scheme.points)
    for answer in attempt.answers:
        answer.point_results = [
            _first_pass(point, answer, cross_check, drawing_judge_available)
            for point in points[answer.question_id]
        ]
    refresh_scores(attempt)


def judge_answer(
    answer: Answer,
    judge: AnswerJudge | None,
    min_confidence: float,
    *,
    drawing_judge: DrawingJudge | None = None,
    drawing_min_confidence: float = 1.0,
    store: FileStore | None = None,
) -> None:
    """Ask the AI judge about this answer's pending points, and apply its verdicts with checks.

    A drawing point (diagram, or a photographed graph) is judged separately, from its
    photo, by drawing_judge - never by the text judge, which only ever sees answer.text.
    judge may be None when only a drawing judge is configured (text points then stay
    pending, same as when no judge at all is configured today).
    """
    pending = [result for result in answer.point_results if result.status == PointStatus.PENDING]
    if not pending:
        return
    text_pending = [r for r in pending if not _is_drawing_point(r.point, answer)]
    drawing_pending = [r for r in pending if _is_drawing_point(r.point, answer)]

    if text_pending and judge is not None:
        verdicts = {
            v.code: v for v in judge.judge(_judge_request(answer, [r.point for r in text_pending]))
        }
        for result in text_pending:
            _apply_verdict(
                result, verdicts.get(result.point.code), answer.text or "", judge.name, min_confidence
            )

    if drawing_pending:
        _judge_drawings(drawing_pending, answer, drawing_judge, drawing_min_confidence, store)


def finalize_without_ai(answer: Answer) -> None:
    """The AI judge could not be reached: let the checker's own decisions stand."""
    for result in answer.point_results:
        if result.status == PointStatus.PENDING and result.checker_awarded is not None:
            _finalize_from_checker(result)


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


# First pass


def _first_pass(
    point: MarkingPoint, answer: Answer, cross_check: bool, drawing_judge_available: bool
) -> PointResult:
    if point.point_type == PointType.MCQ_KEY:
        return _judge_mcq(point, answer)
    if _is_drawing_point(point, answer) and not drawing_judge_available:
        return PointResult(
            point=point,
            status=PointStatus.NEEDS_REVIEW,
            awarded=0.0,
            reason="A drawing in a typed answer is marked by a teacher",
        )

    # With a drawing judge available, a drawing point falls through to check_point()
    # exactly like any other point code cannot decide (it always returns None for
    # these), becoming PENDING like an essay/concept point - judge_answer() then
    # routes it to the drawing judge instead of the text judge.
    outcome = check_point(point, _student_answer(answer))
    if outcome is None:
        return PointResult(point=point, status=PointStatus.PENDING, awarded=0.0)

    result = PointResult(
        point=point,
        status=PointStatus.PENDING,
        awarded=0.0,
        checker_awarded=outcome.awarded,
        evidence=outcome.evidence,
        reason=outcome.reason,
    )
    if not cross_check:
        _finalize_from_checker(result)
    return result


def _is_drawing_point(point: MarkingPoint, answer: Answer) -> bool:
    """A drawing is judged from its photo, not from typed text - unless the student
    plotted a graph as data instead of photographing it, which the chemistry checker
    already handles like any other structured answer."""
    if point.point_type == PointType.DIAGRAM:
        return True
    return point.point_type == PointType.GRAPH and answer.data is None


def _student_answer(answer: Answer) -> StudentAnswer:
    return StudentAnswer(text=answer.text or "", graph=GraphAnswer.from_data(answer.data))


def _finalize_from_checker(result: PointResult) -> None:
    awarded = bool(result.checker_awarded)
    result.status = PointStatus.AWARDED if awarded else PointStatus.NOT_AWARDED
    result.awarded = result.point.marks if awarded else 0.0
    result.method = MarkingMethod.CHECKER
    result.marker = CHECKER_NAME
    result.confidence = 1.0  # an exact code check, not a guess


def _judge_mcq(point: MarkingPoint, answer: Answer) -> PointResult:
    # Some schemes accept more than one option as equally correct, e.g. "4/5".
    accepted = [point.expected["option"], *point.alternatives]
    correct = answer.mcq_option in accepted
    key = "/".join(accepted)
    return PointResult(
        point=point,
        status=PointStatus.AWARDED if correct else PointStatus.NOT_AWARDED,
        awarded=point.marks if correct else 0.0,
        method=MarkingMethod.RULE,
        marker=MCQ_KEY_MARKER,
        evidence=f"Chose option {answer.mcq_option}; correct option is {key}",
        confidence=1.0,
    )


# AI judge


def _judge_request(answer: Answer, points: list[MarkingPoint]) -> JudgeRequest:
    scheme = answer.attempt.scheme
    question = answer.question
    ecf_rules = [
        r
        for r in scheme.rules
        if r.question_id == question.id and r.rule_type == RuleType.ERROR_CARRIED_FORWARD
    ]
    return JudgeRequest(
        question=question_with_context(question),
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


def question_with_context(question: Question) -> str:
    """The question's wording with its parents', e.g. the titration set-up before part (b)."""
    chain = []
    current: Question | None = question
    while current is not None:
        chain.append(f"{current.full_label}: {current.text}")
        current = current.parent
    return "\n".join(reversed(chain))


@dataclass(frozen=True)
class _Judgement:
    """What the AI decided, once code has checked whether it can be trusted."""

    awarded: bool | None  # None = cannot be trusted
    reason: str


def _trust(verdict: PointVerdict | None, answer_text: str, min_confidence: float) -> _Judgement:
    if verdict is None:
        return _Judgement(None, "The AI judge gave no decision for this point")
    if verdict.awarded and not quote_in_answer(verdict.evidence_quote, answer_text):
        return _Judgement(None, f"AI evidence was not found in the answer. AI said: {verdict.reason}")
    if verdict.confidence < min_confidence:
        return _Judgement(None, verdict.reason)
    return _Judgement(verdict.awarded, verdict.reason)


def _apply_verdict(
    result: PointResult, verdict: PointVerdict | None, answer_text: str, marker: str, min_confidence: float
) -> None:
    result.ai_awarded = verdict.awarded if verdict else None
    judgement = _trust(verdict, answer_text, min_confidence)

    if result.checker_awarded is not None:
        _combine(result, judgement, marker)
        return

    result.method = MarkingMethod.LLM
    result.marker = marker
    result.reason = judgement.reason
    if verdict is not None:
        result.confidence = min(max(verdict.confidence, 0.0), 1.0)
        result.evidence = verdict.evidence_quote
    if judgement.awarded is None:
        result.status = PointStatus.NEEDS_REVIEW
        result.awarded = 0.0
        return
    result.status = PointStatus.AWARDED if judgement.awarded else PointStatus.NOT_AWARDED
    result.awarded = result.point.marks if judgement.awarded else 0.0


# Drawing judge


def _judge_drawings(
    pending: list[PointResult],
    answer: Answer,
    drawing_judge: DrawingJudge | None,
    min_confidence: float,
    store: FileStore | None,
) -> None:
    """A drawing point goes to a teacher, same as always, unless a drawing judge and
    the answer's photos are both available - the same "no judge configured" fallback
    the text judge already has (see finalize_without_ai)."""
    if drawing_judge is None or store is None or not answer.images:
        for result in pending:
            result.status = PointStatus.NEEDS_REVIEW
            result.awarded = 0.0
            result.reason = "A drawing in a typed answer is marked by a teacher"
        return

    images = [Image(store.load(image.storage_key), image.content_type) for image in answer.images]
    for result in pending:
        verdict = drawing_judge.judge(
            point_description=result.point.description, expected=result.point.expected, images=images
        )
        _apply_drawing_verdict(result, verdict, drawing_judge.name, min_confidence)


def _apply_drawing_verdict(
    result: PointResult, verdict: DrawingVerdict | None, marker: str, min_confidence: float
) -> None:
    result.ai_awarded = verdict.awarded if verdict else None
    result.method = MarkingMethod.LLM
    result.marker = marker
    if verdict is None:
        result.status = PointStatus.NEEDS_REVIEW
        result.awarded = 0.0
        result.reason = "The AI judge could not evaluate this drawing"
        return

    result.confidence = min(max(verdict.confidence, 0.0), 1.0)
    result.reason = verdict.reason
    if verdict.confidence < min_confidence:
        result.status = PointStatus.NEEDS_REVIEW
        result.awarded = 0.0
        return
    result.status = PointStatus.AWARDED if verdict.awarded else PointStatus.NOT_AWARDED
    result.awarded = result.point.marks if verdict.awarded else 0.0


def _combine(result: PointResult, judgement: _Judgement, marker: str) -> None:
    """The checker and the AI judged this point without seeing each other's answer."""
    if judgement.awarded is None:  # the AI was unusable, so the exact code check stands
        _finalize_from_checker(result)
        result.reason = f"{result.reason} (the AI judge could not confirm this)"
        return
    if judgement.awarded == result.checker_awarded:  # both agree
        _finalize_from_checker(result)
        return

    checker_said = "earns the mark" if result.checker_awarded else "does not earn the mark"
    result.status = PointStatus.NEEDS_REVIEW
    result.awarded = 0.0
    result.method = MarkingMethod.CHECKER
    result.marker = f"{CHECKER_NAME} vs {marker}"
    result.confidence = None
    result.reason = (
        f"A teacher should check this: the chemistry checker says the answer {checker_said} "
        f"({result.reason}), but the AI judge disagrees ({judgement.reason})."
    )


# Totals


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
