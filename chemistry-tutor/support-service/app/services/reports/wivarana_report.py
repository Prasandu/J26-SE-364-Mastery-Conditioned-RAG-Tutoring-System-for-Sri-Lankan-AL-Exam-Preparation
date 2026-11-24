"""Wivarana ("explanation") report: an explanation-based learning report,
not just raw numbers. Combines the same recorded evidence the Dashboard
already shows with a narrative summary — but every factual claim in the
narrative must trace back to real recorded data, same anti-fabrication
principle as Chat/Consultation.
"""

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.flagged_question import FlaggedQuestion
from app.models.student_attempt import StudentAttempt
from app.models.verified_question import VerifiedQuestion
from app.services.learning_state.intervention_history import get_intervention_history
from app.services.mastery.evidence import get_student_dashboard
from app.services.practice.explain import explain_flagged_question
from app.services.tutoring.llm_adapter import get_llm_provider

LLM_UNAVAILABLE_MESSAGE = "The AI service is temporarily unavailable. Please try again in a moment."

NARRATIVE_PROMPT_TEMPLATE = """You are writing a short explanation-based learning report \
("Wivarana report") for a Sri Lankan G.C.E. Advanced Level Chemistry student, based strictly \
on the recorded evidence below. Do not add any fact not present in this evidence.

Overall: {total_correct} out of {total_attempts} attempts correct, \
{independent_percent}% of correct answers were solved independently (without hints).

Per-question evidence:
{evidence_text}

Interventions triggered during this student's sessions:
{intervention_text}

Write a short (120-180 words) explanation of this student's learning pattern: which topics \
show independent mastery, which show assisted mastery or ongoing struggle, and what the \
intervention history suggests. Be factual and supportive, not judgmental. Do not invent \
numbers or topics not listed above.
"""


@dataclass
class QuestionEvidence:
    question_code: str
    unit: str
    status: str  # "independent" | "assisted" | "struggling"
    explanation: str


@dataclass
class CorrectedAnswer:
    question_code: str
    question_text: str
    wrong_answers: list[str]  # distinct wrong answers the student submitted
    theory_explanation: str  # the underlying concept, from the question's own concept_text
    worked_solution: str  # step-by-step, from the question's own worked_steps_text
    final_answer: str  # from the question's own full_solution_text


@dataclass
class WivaranaReport:
    student_id: str
    generated_at: datetime
    total_attempts: int
    total_correct: int
    independent_rate: float
    question_evidence: list[QuestionEvidence]
    corrected_answers: list[CorrectedAnswer]
    intervention_summary: list[str]
    narrative: str


def _build_question_evidence(db: Session, per_question) -> list[QuestionEvidence]:
    evidence: list[QuestionEvidence] = []
    for p in per_question:
        question = db.query(VerifiedQuestion).filter_by(question_code=p.question_code).first()
        unit = question.unit if question else "?"

        if p.independent_successes > 0:
            status = "independent"
            explanation = (
                f"Solved correctly without hints ({p.independent_successes} independent "
                "success(es)) — demonstrates independent mastery."
            )
        elif p.assisted_successes > 0:
            status = "assisted"
            explanation = (
                f"Solved correctly, but only after hints ({p.assisted_successes} assisted "
                f"success(es), {p.hints_used_total} hint(s) used in total) — assisted "
                "mastery, not yet independent."
            )
        elif p.attempts > 0:
            status = "struggling"
            explanation = (
                f"Attempted {p.attempts} time(s) without a correct answer yet "
                f"({p.hints_used_total} hint(s) used)."
            )
        else:
            continue

        evidence.append(
            QuestionEvidence(question_code=p.question_code, unit=unit, status=status, explanation=explanation)
        )
    return evidence


def _build_corrected_answers(db: Session, student_id: str) -> list[CorrectedAnswer]:
    """For every question the student ever got wrong, show their wrong
    answer(s) alongside the question's own stored theory explanation and
    step-by-step worked solution. This content is teacher-written (the
    same fixed hint-ladder text used in Practice, not LLM-generated), so
    it is already verified and needs no grounding check here.
    """
    incorrect_attempts = (
        db.execute(
            select(StudentAttempt).where(
                StudentAttempt.student_id == student_id, StudentAttempt.correct.is_(False)
            )
        )
        .scalars()
        .all()
    )

    wrong_answers_by_question: dict[str, list[str]] = {}
    for a in incorrect_attempts:
        answers = wrong_answers_by_question.setdefault(a.question_code, [])
        if a.submitted_answer not in answers:
            answers.append(a.submitted_answer)

    corrected: list[CorrectedAnswer] = []
    for question_code, wrong_answers in wrong_answers_by_question.items():
        question = db.query(VerifiedQuestion).filter_by(question_code=question_code).first()
        if question is None:
            continue
        corrected.append(
            CorrectedAnswer(
                question_code=question_code,
                question_text=question.question_text,
                wrong_answers=wrong_answers,
                theory_explanation=question.concept_text,
                worked_solution=question.worked_steps_text,
                final_answer=question.full_solution_text,
            )
        )
    return corrected


def _build_flagged_corrected_answers(db: Session, student_id: str) -> list[CorrectedAnswer]:
    """Every Review Mistakes question (from another component, e.g. a model
    paper) belonging to this student — a second source alongside
    verified_questions attempts, since that's the Practice flow most
    students currently use. The Wivarana report shows every one of them
    with a full step-by-step explanation, not just the ones the student
    happened to click all the way through in Practice: if a question
    doesn't have a stored explanation yet, one is generated now (and cached
    on the row, so this doesn't regenerate on every report view).
    """
    flagged = (
        db.execute(select(FlaggedQuestion).where(FlaggedQuestion.student_id == student_id))
        .scalars()
        .all()
    )

    corrected: list[CorrectedAnswer] = []
    for f in flagged:
        explanation_text = f.explanation_text
        if explanation_text is None:
            result = explain_flagged_question(db, f)
            if result.grounded:
                explanation_text = result.text
                f.explanation_text = explanation_text
                db.commit()
            else:
                explanation_text = result.text  # abstention/unavailable message, not cached

        corrected.append(
            CorrectedAnswer(
                question_code=f"flagged-{f.id}",
                question_text=f.question_text,
                wrong_answers=[f.submitted_answer],
                theory_explanation=f"Topic: {f.topic}" + (f" ({f.sub_topic})" if f.sub_topic else ""),
                worked_solution=explanation_text,
                final_answer=f.correct_answer or "(see explanation above)",
            )
        )
    return corrected


def generate_wivarana_report(db: Session, student_id: str) -> WivaranaReport:
    dashboard = get_student_dashboard(db, student_id)
    history = get_intervention_history(db, student_id)
    evidence = _build_question_evidence(db, dashboard.per_question)
    verified_corrected_answers = _build_corrected_answers(db, student_id)
    flagged_corrected_answers = _build_flagged_corrected_answers(db, student_id)
    corrected_answers = verified_corrected_answers + flagged_corrected_answers
    intervention_summary = [h.message for h in history]

    if not evidence and not corrected_answers:
        return WivaranaReport(
            student_id=student_id,
            generated_at=datetime.now(UTC),
            total_attempts=0,
            total_correct=0,
            independent_rate=0.0,
            question_evidence=[],
            corrected_answers=[],
            intervention_summary=[],
            narrative="No practice activity recorded yet for this student.",
        )

    evidence_text = "\n".join(f"- {e.question_code} (Unit {e.unit}): {e.explanation}" for e in evidence)
    if flagged_corrected_answers:
        evidence_text += (
            f"\n- Also has {len(flagged_corrected_answers)} question(s) flagged wrong on model "
            "papers (Review Mistakes practice), each with a step-by-step explanation below."
        )
    evidence_text = evidence_text.strip() or "(no verified_questions attempts recorded yet)"
    intervention_text = "\n".join(f"- {m}" for m in intervention_summary) or "(none)"
    independent_percent = round(dashboard.independent_rate * 100)

    prompt = NARRATIVE_PROMPT_TEMPLATE.format(
        total_correct=dashboard.total_correct,
        total_attempts=dashboard.total_attempts,
        independent_percent=independent_percent,
        evidence_text=evidence_text,
        intervention_text=intervention_text,
    )

    provider = get_llm_provider()
    try:
        narrative = provider.generate_response(
            "You are a precise, factual educational report writer.", prompt
        )
    except Exception:
        narrative = LLM_UNAVAILABLE_MESSAGE

    return WivaranaReport(
        student_id=student_id,
        generated_at=datetime.now(UTC),
        total_attempts=dashboard.total_attempts,
        total_correct=dashboard.total_correct,
        independent_rate=dashboard.independent_rate,
        question_evidence=evidence,
        corrected_answers=corrected_answers,
        intervention_summary=intervention_summary,
        narrative=narrative,
    )
