from app.models.verified_question import VerifiedQuestion

HINT_LEVEL_NAMES = {
    1: "Hint",
    2: "Concept",
    3: "Guided Question",
    4: "Worked Steps",
    5: "Final Solution",
}


def choose_hint_level(attempts: int, hints_used: int, requested_full_solution: bool) -> int:
    """Decide which hint level the student should see next.

    Deterministic and server-controlled on purpose: the AI must not decide
    how much help a student gets. A starting rule, not a tuned policy —
    does not yet account for correctness, detected misconceptions, or the
    active task, per the original design note.
    """
    if requested_full_solution:
        return 5

    if attempts == 0 and hints_used == 0:
        return 1

    return min(5, max(1, hints_used + 1))


def get_hint_content(question: VerifiedQuestion, level: int) -> str:
    content_by_level = {
        1: question.hint_text,
        2: question.concept_text,
        3: question.guided_question_text,
        4: question.worked_steps_text,
        5: question.full_solution_text,
    }
    return content_by_level[level]
