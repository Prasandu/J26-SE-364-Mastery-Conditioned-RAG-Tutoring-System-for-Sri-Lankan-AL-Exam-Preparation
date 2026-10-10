"""Reading a scanned past paper or marking scheme into the shapes the admin API accepts.

The model only copies what is printed. The result is always a draft for a person to
check before it is published, so a misread question can never become a live paper.
"""

from collections.abc import Sequence
from typing import Any

from pydantic import BaseModel, Field

from app.services.vision import Image, VisionModel

CHEMISTRY_NOTATION = (
    "Write chemistry in plain standard notation: H2SO4, SO4^2-, Ca^2+, NaOH(aq), -> for a "
    "reaction arrow, <=> for an equilibrium, 2.00 x 10^-3 for powers of ten, mol dm-3 for units."
)


class ExtractedOption(BaseModel):
    label: str  # "1".."5" as printed
    text: str


class ExtractedQuestion(BaseModel):
    label: str = Field(description='As printed: "7", "(a)", "(i)"')
    text: str
    max_marks: float | None = None
    options: list[ExtractedOption] = []  # MCQ only
    sub_questions: list["ExtractedQuestion"] = []
    has_figure: bool = False  # a diagram, graph or structure the text cannot carry


class ExtractedPaper(BaseModel):
    questions: list[ExtractedQuestion] = []
    notes: list[str] = []  # anything a person should check, e.g. "Q9 depends on a figure"


class ExtractedPoint(BaseModel):
    description: str = Field(description="What earns the mark, in the marking scheme's own words")
    marks: float
    point_type: str = Field(
        description="mcq_key, concept, equation, formula, calculation, unit, diagram or graph"
    )
    expected: dict[str, Any] | None = None
    alternatives: list[str] = []


class ExtractedScheme(BaseModel):
    question: str = Field(description='Full label as printed: "2(b)(ii)"')
    model_answer: str | None = None
    points: list[ExtractedPoint] = []


class ExtractedSchemePage(BaseModel):
    questions: list[ExtractedScheme] = []
    mcq_answers: dict[str, str] = Field(default_factory=dict, description='Answer key, e.g. {"7": "4"}')
    notes: list[str] = []


PAPER_PROMPT = f"""\
You copy printed Sri Lankan G.C.E. A/L Chemistry exam questions from a scanned page into data.

Rules:
1. Copy only what is printed. Do NOT answer the questions and do NOT invent anything.
2. {CHEMISTRY_NOTATION}
3. Use the labels exactly as printed: "7", "(a)", "(i)". Put sub-parts in sub_questions.
4. Include every option of a multiple choice question, with its printed number.
5. If a question continues past the bottom of the page, copy what is visible and say so in notes.
6. Set has_figure to true where the question relies on a diagram, graph or structure, and
   describe it in one short line in square brackets inside the text.
7. max_marks only when the page prints a mark allocation for that question.
"""

SCHEME_PROMPT = f"""\
You copy a printed Sri Lankan G.C.E. A/L Chemistry marking scheme from a scanned page into data.

Rules:
1. Copy only what is printed. Do NOT invent marking points and do NOT add your own chemistry.
2. {CHEMISTRY_NOTATION}
3. Use the full question label as printed, for example "2(b)(ii)".
4. Split the marks the way the scheme does. "04 marks x 8 = 32 marks" means eight separate
   points worth 4 marks each, so list eight points.
5. point_type: mcq_key for an answer key, calculation for a numeric answer, equation for a
   chemical equation, unit for a unit, diagram or graph for a drawing, otherwise concept.
6. expected is only for what code can check, such as
   {{"value": 0.08, "unit": "mol dm-3"}} or {{"equation": "..."}} or {{"option": "4"}}.
7. Put any instruction to the examiner, such as "deduct 01 mark if ...", into notes.
8. For an answer key table, fill mcq_answers with question number to option number.
"""


class ContentExtractor:
    """Reads scanned pages with any vision model."""

    def __init__(self, model: VisionModel) -> None:
        self._model = model
        self.name = model.name

    def read_paper(self, images: Sequence[Image], hint: str | None = None) -> ExtractedPaper:
        return self._model.ask(
            system=PAPER_PROMPT,
            user=_user_prompt("exam paper", len(images), hint),
            images=images,
            shape=ExtractedPaper,
        )

    def read_scheme(self, images: Sequence[Image], hint: str | None = None) -> ExtractedSchemePage:
        return self._model.ask(
            system=SCHEME_PROMPT,
            user=_user_prompt("marking scheme", len(images), hint),
            images=images,
            shape=ExtractedSchemePage,
        )


def _user_prompt(kind: str, count: int, hint: str | None) -> str:
    pages = "this page" if count == 1 else f"these {count} pages, in order"
    prompt = f"Copy the {kind} content from {pages}."
    return f"{prompt}\n\nContext: {hint}" if hint else prompt
