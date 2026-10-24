"""How long a student is allowed for an attempt.

The times are the real G.C.E. (A/L) Chemistry paper's own:

  Paper I     multiple choice   2 hours
  Paper II A  structured        1 hour
  Paper II B  essay             2 hours

A past paper is sat in the time the real paper allows, however many questions it
happens to contain, so its allowance is the sum of the official times for the kinds
of section it has - a paper with both a structured and an essay section gets three
hours, as the real Paper II does.

A model paper is a different size every time, so it cannot use a fixed time. It uses
the same per-question rates its shape was planned with, which are these same official
times divided by the real paper's question count (see generator/blueprint.py).
"""

from datetime import datetime, timedelta
from math import ceil

from app.models import AnswerMode, Paper, PaperKind
from app.services.generator.blueprint import MINUTES_PER_QUESTION, ROUND_TO_SECONDS

OFFICIAL_MINUTES = {
    AnswerMode.MCQ: 120,
    AnswerMode.STRUCTURED: 60,
    AnswerMode.ESSAY: 120,
}


def attempt_minutes(paper: Paper) -> float:
    """The whole paper's time allowance, in minutes."""
    if paper.kind == PaperKind.PAST:
        return float(sum(OFFICIAL_MINUTES[mode] for mode in _modes_asked(paper)))
    return _rounded(sum(_section_minutes(paper)))


def expires_at(paper: Paper, started_at: datetime) -> datetime:
    return started_at + timedelta(minutes=attempt_minutes(paper))


def _modes_asked(paper: Paper) -> set[AnswerMode]:
    """The kinds of section the paper really asks - an empty section buys no time."""
    return {section.answer_mode for section in paper.sections if _questions_in(section)}


def _section_minutes(paper: Paper) -> list[float]:
    return [
        _questions_in(section) * MINUTES_PER_QUESTION[section.answer_mode]
        for section in paper.sections
    ]


def _questions_in(section) -> int:
    """Whole questions, not their parts: 1(b)(iii) is answered inside question 1's time."""
    return sum(1 for question in section.questions if question.parent is None)


def _rounded(raw: float) -> float:
    """Up to a whole half minute, the same step the paper's shape was planned with."""
    return ceil(raw * 60 / ROUND_TO_SECONDS) * ROUND_TO_SECONDS / 60
