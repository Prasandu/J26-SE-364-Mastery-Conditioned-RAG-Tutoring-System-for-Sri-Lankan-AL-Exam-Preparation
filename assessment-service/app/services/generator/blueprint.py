"""What a model paper will contain, before anything is written.

The person choosing picks topics and how many questions of each kind they want. From
that alone the paper's shape is fixed: its sections, its total marks and how long it
should take. None of this needs the AI, so it can be shown and adjusted instantly.

The minutes come from the real G.C.E. (A/L) Chemistry papers:

  Paper I      50 multiple choice  in 2 hours      2.4 minutes each
  Paper II A    4 structured       in 1 hour        15 minutes each
  Paper II B    4 essays           in 2 hours       30 minutes each
"""

from dataclasses import dataclass
from math import ceil

from app.models import AnswerMode

MINUTES_PER_QUESTION = {
    AnswerMode.MCQ: 2.4,
    AnswerMode.STRUCTURED: 15.0,
    AnswerMode.ESSAY: 30.0,
}

MARKS_PER_QUESTION = {
    AnswerMode.MCQ: 1.0,
    AnswerMode.STRUCTURED: 15.0,
    AnswerMode.ESSAY: 15.0,
}

# Section codes follow the real papers, so a generated paper reads like a familiar one.
SECTION_CODES = {
    AnswerMode.MCQ: "I",
    AnswerMode.STRUCTURED: "II-A",
    AnswerMode.ESSAY: "II-B",
}

SECTION_TITLES = {
    AnswerMode.MCQ: "Multiple choice",
    AnswerMode.STRUCTURED: "Structured essay",
    AnswerMode.ESSAY: "Essay",
}

# A paper's time is rounded up to a whole five minutes, the way a real one is written.
ROUND_TO_MINUTES = 5
MAX_QUESTIONS_PER_SECTION = 60


@dataclass(frozen=True)
class SectionPlan:
    answer_mode: AnswerMode
    count: int

    @property
    def code(self) -> str:
        return SECTION_CODES[self.answer_mode]

    @property
    def title(self) -> str:
        return SECTION_TITLES[self.answer_mode]

    @property
    def minutes(self) -> float:
        return self.count * MINUTES_PER_QUESTION[self.answer_mode]

    @property
    def marks(self) -> float:
        return self.count * MARKS_PER_QUESTION[self.answer_mode]


@dataclass(frozen=True)
class Blueprint:
    """The shape of a paper: what it asks about, and how big it is."""

    title: str
    topic_codes: list[str]
    sections: list[SectionPlan]

    @property
    def questions(self) -> int:
        return sum(section.count for section in self.sections)

    @property
    def marks(self) -> float:
        return sum(section.marks for section in self.sections)

    @property
    def minutes(self) -> int:
        """Rounded up to a whole five minutes, as a printed paper would say."""
        raw = sum(section.minutes for section in self.sections)
        return int(ceil(raw / ROUND_TO_MINUTES) * ROUND_TO_MINUTES)

    @property
    def duration(self) -> str:
        """The time as it would be printed: "2 hours 30 minutes"."""
        return spell_minutes(self.minutes)


def spell_minutes(minutes: int) -> str:
    hours, rest = divmod(minutes, 60)
    parts = []
    if hours:
        parts.append(f"{hours} hour{'' if hours == 1 else 's'}")
    if rest or not hours:
        parts.append(f"{rest} minute{'' if rest == 1 else 's'}")
    return " ".join(parts)


def problems(blueprint: Blueprint) -> list[str]:
    """Anything wrong with the request, in plain English. Empty list means it is fine."""
    found = []
    if not blueprint.topic_codes:
        found.append("Choose at least one topic")
    if not any(section.count for section in blueprint.sections):
        found.append("Ask for at least one question")

    seen = set()
    for section in blueprint.sections:
        if section.count < 0:
            found.append(f"{section.title}: a count cannot be negative")
        if section.count > MAX_QUESTIONS_PER_SECTION:
            found.append(
                f"{section.title}: {section.count} questions is more than the "
                f"{MAX_QUESTIONS_PER_SECTION} allowed in one section"
            )
        if section.answer_mode in seen:
            found.append(f"{section.title} is asked for more than once")
        seen.add(section.answer_mode)
    return found


def build_blueprint(title: str, topic_codes: list[str], counts: dict[AnswerMode, int]) -> Blueprint:
    """A blueprint in paper order, leaving out the kinds nobody asked for."""
    sections = [
        SectionPlan(answer_mode=mode, count=counts.get(mode, 0))
        for mode in (AnswerMode.MCQ, AnswerMode.STRUCTURED, AnswerMode.ESSAY)
        if counts.get(mode, 0) > 0
    ]
    return Blueprint(title=title, topic_codes=list(topic_codes), sections=sections)
