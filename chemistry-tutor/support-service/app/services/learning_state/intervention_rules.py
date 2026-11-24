from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.hint_event import HintEvent
from app.models.student_attempt import StudentAttempt
from app.models.verified_question import VerifiedQuestion

# Starting thresholds from the original roadmap, not experimentally tuned.
REPEATED_INCORRECT_FOR_SIMPLER_EXPLANATION = 2
UNSUCCESSFUL_ATTEMPTS_FOR_GUIDED_STEPS = 3
QUESTIONS_WITH_HINTS_FOR_PREREQUISITE_REVIEW = 2

# No inactivity-timer or self-report signal exists yet (both correctly
# deferred — see roadmap), so this is a proxy: a lot of attempts in one
# sitting is a reasonable fatigue signal from data we do have.
TOTAL_ATTEMPTS_FOR_BREAK_SUGGESTION = 8

# Escalation = "this needs a teacher, not just another hint". Triggers when
# a student has struggled (zero independent success at all) across several
# different questions, not just one.
QUESTIONS_WITH_ZERO_INDEPENDENT_SUCCESS_FOR_ESCALATION = 3


@dataclass
class Intervention:
    rule: str
    message: str
    question_code: str | None = None
    unit: str | None = None


def get_interventions(db: Session, student_id: str) -> list[Intervention]:
    """Explainable, rule-based suggestions from a student's attempt/hint
    history. Deliberately simple if-then rules, not a trained model — per
    the roadmap, behavior patterns indicate possible learning difficulty,
    not a diagnosis, and must never penalize the student.
    """
    attempts = (
        db.execute(
            select(StudentAttempt)
            .where(StudentAttempt.student_id == student_id)
            .order_by(StudentAttempt.question_code, StudentAttempt.created_at)
        )
        .scalars()
        .all()
    )
    hints = db.execute(select(HintEvent).where(HintEvent.student_id == student_id)).scalars().all()
    questions = db.execute(select(VerifiedQuestion)).scalars().all()
    unit_by_code = {q.question_code: q.unit for q in questions}

    interventions: list[Intervention] = []

    attempts_by_question: dict[str, list[StudentAttempt]] = defaultdict(list)
    for a in attempts:
        attempts_by_question[a.question_code].append(a)

    for code, question_attempts in attempts_by_question.items():
        if any(a.correct for a in question_attempts):
            continue  # already solved, no struggle signal to flag

        incorrect_count = sum(1 for a in question_attempts if not a.correct)
        if incorrect_count >= UNSUCCESSFUL_ATTEMPTS_FOR_GUIDED_STEPS:
            interventions.append(
                Intervention(
                    rule="guided_worked_steps",
                    message=(
                        f"You've had {incorrect_count} unsuccessful attempts on {code}. "
                        "Guided worked steps might help."
                    ),
                    question_code=code,
                )
            )
        elif incorrect_count >= REPEATED_INCORRECT_FOR_SIMPLER_EXPLANATION:
            interventions.append(
                Intervention(
                    rule="simpler_explanation",
                    message=(
                        f"A couple of incorrect attempts on {code} so far. "
                        "A simpler explanation might help."
                    ),
                    question_code=code,
                )
            )

    questions_with_hints_by_unit: dict[str, set[str]] = defaultdict(set)
    for h in hints:
        unit = unit_by_code.get(h.question_code)
        if unit:
            questions_with_hints_by_unit[unit].add(h.question_code)

    for unit, codes in questions_with_hints_by_unit.items():
        if len(codes) >= QUESTIONS_WITH_HINTS_FOR_PREREQUISITE_REVIEW:
            interventions.append(
                Intervention(
                    rule="prerequisite_revision",
                    message=(
                        f"You've used hints on multiple Unit {unit} questions. "
                        f"Reviewing Unit {unit} prerequisite concepts might help."
                    ),
                    unit=unit,
                )
            )

    if len(attempts) >= TOTAL_ATTEMPTS_FOR_BREAK_SUGGESTION:
        interventions.append(
            Intervention(
                rule="suggest_break",
                message=(
                    f"You've made {len(attempts)} attempts this session. "
                    "It's okay to take a short break — you can come back to this anytime."
                ),
            )
        )

    zero_independent_questions = [
        code
        for code, question_attempts in attempts_by_question.items()
        if not any(a.independent_success for a in question_attempts)
    ]
    if len(zero_independent_questions) >= QUESTIONS_WITH_ZERO_INDEPENDENT_SUCCESS_FOR_ESCALATION:
        interventions.append(
            Intervention(
                rule="escalate_to_human_support",
                message=(
                    "You've needed assistance across several questions without solving any "
                    "independently yet. It might help to talk this through with your teacher."
                ),
            )
        )

    return interventions
