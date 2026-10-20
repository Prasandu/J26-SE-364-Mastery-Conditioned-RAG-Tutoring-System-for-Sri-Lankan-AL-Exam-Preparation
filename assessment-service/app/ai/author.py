"""Asking a model to write exam questions and the marking scheme for them.

Writing the questions is the easy half. The marking points are what matter: without
them a paper cannot be marked at all, by the checker, the AI judge or a teacher. So
the model is asked for both together, and a question without points is thrown away.

What comes back is a draft. A marking scheme written by a model is not an official
one, and it is never published without a teacher reading it first.
"""

import json
from typing import Protocol

import openai
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from app.ai.tuning import (
    AUTHORING_TEMPERATURE as TEMPERATURE,
)
from app.ai.tuning import (
    AUTHORING_TIMEOUT_SECONDS as TIMEOUT_SECONDS,
)
from app.ai.tuning import (
    MAX_OUTPUT_TOKENS,
    OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS,
    RETRY_ATTEMPTS,
    RETRY_STATUS_CODES,
    json_instruction,
)


class WrittenOption(BaseModel):
    label: str
    text: str


class WrittenPoint(BaseModel):
    code: str = Field(description="P1, P2, ... or K for a multiple choice key")
    description: str = Field(description="What earns this mark, in the examiner's words")
    marks: float
    point_type: str = Field(description="mcq_key, concept, equation, formula, calculation or unit")
    # The three below turn a point into something code can check and re-check. Without
    # them a calculation can only ever be marked by the AI judge or by a person.
    expected_value: float | None = Field(
        default=None, description="calculation only: the numeric answer, e.g. 0.08"
    )
    expected_unit: str | None = Field(
        default=None, description="calculation or unit: the unit, e.g. mol dm-3"
    )
    working: str | None = Field(
        default=None,
        description=(
            "calculation only: the arithmetic that gives expected_value, numbers only, "
            "e.g. '0.0200 * 0.100 / 0.0250'"
        ),
    )
    alternatives: list[str] = Field(
        default_factory=list, description="Other answers that earn this mark just as well"
    )

    def expected_dict(self) -> dict | None:
        """What a checker needs, in the shape the marking scheme stores."""
        expected = {
            "value": self.expected_value,
            "unit": (self.expected_unit or "").strip() or None,
            "working": (self.working or "").strip() or None,
        }
        kept = {key: value for key, value in expected.items() if value is not None}
        return kept or None


class WrittenEcf(BaseModel):
    """Error carried forward: this point may be awarded from the student's own earlier values."""

    point: str = Field(description="The later point code, e.g. P3")
    depends_on: list[str] = Field(description="The earlier point codes it follows from, e.g. ['P1']")


class WrittenTable(BaseModel):
    """Tabulated data the question refers to, e.g. a set of experimental readings -
    the only way to show tabular data at all (see SYSTEM_PROMPT)."""

    headers: list[str]
    rows: list[list[str]] = Field(description="Each row has exactly one cell per header, in order")


class WrittenQuestion(BaseModel):
    label: str = Field(description='"1", "2" ... within the section')
    text: str
    topic_code: str = Field(description="The syllabus topic this question tests")
    options: list[WrittenOption] = Field(default_factory=list, description="Multiple choice only")
    table: WrittenTable | None = Field(
        default=None,
        description="Only if the question is built around tabulated data the student must read from",
    )
    answer: str = Field(description="The full model answer")
    points: list[WrittenPoint]
    carried_forward: list[WrittenEcf] = Field(
        default_factory=list, description="Marks that follow from an earlier answer"
    )


class WrittenSection(BaseModel):
    questions: list[WrittenQuestion]


class QuestionAuthor(Protocol):
    name: str  # stored on the paper, so a generated paper stays traceable

    def write(self, brief: str) -> WrittenSection: ...


SYSTEM_PROMPT = """\
You write practice questions for the Sri Lankan G.C.E. Advanced Level Chemistry examination,
following the 2017 National Institute of Education syllabus.

Rules:
1. Ask only about the syllabus content you are given. Anything outside it is wrong, even if
   it is correct chemistry.
2. Match the real examination in style, difficulty and wording.
3. Write a model answer for every question, and the marking points that go with it.
4. Marking points split the question into separately earned marks. Each one says what earns it,
   in the words an examiner would use, and the marks add up to the question's total.
5. point_type: mcq_key for a multiple choice answer; calculation for a numeric answer; equation
   for a chemical equation; formula for a formula or structure; unit where the unit itself earns
   the mark; concept for everything else.
6. Multiple choice: exactly five options labelled 1 to 5, exactly one correct, and exactly one
   marking point with code K, 1 mark, point_type mcq_key, whose description is the correct option
   label on its own.
7. Chemistry must be correct: formulas, charges, state symbols, units and significant figures.
   Write plainly: H2SO4, SO4^2-, mol dm-3, 2.00 x 10^-3, -> for a reaction arrow.
8. Do not repeat a question you have already written in this paper.
9. Where real past questions are shown, follow their style, difficulty and the way their
   marks are split. Do not copy them.
10. A question must contain every number needed to answer it. Never refer to a diagram,
   graph or figure, because none of those can be shown. A table is the one exception:
   if the question is naturally built around tabulated data (e.g. a set of
   experimental readings), put it in the table field - do not write it into the
   question text as a sentence, and do not also describe a table you put in the
   table field.
11. For a calculation point, give expected_value, expected_unit, and working: the
   arithmetic that produces the value, numbers and operators only (no units, no words).
   The working is recomputed, so it must agree with expected_value.
12. For a unit point, give expected_unit.
13. Where a later mark can be earned from the student's own earlier answer, say so in
   carried_forward rather than making it depend on getting the earlier part right.
14. RESOURCE PASSAGES, if given, are background to help you phrase the question and
   check your chemistry - not a quotation to lift from, and not something to cite. Do
   not name, quote, or refer to a source in the question, the answer, or any marking
   point. Nothing you write is checked against a source after the fact, so never claim
   a resource supports something it does not say.
"""


def build_brief(
    *,
    answer_mode: str,
    count: int,
    marks_each: float,
    topics: list[str],
    avoid: list[str],
    examples: list[str] | None = None,
    resources: list[str] | None = None,
) -> str:
    """The instructions for one section of the paper."""
    kinds = {
        "mcq": "multiple choice questions, five options each, exactly one correct",
        "structured": (
            "structured questions. Each has parts (a), (b), (c) written into the question text, "
            "and marking points covering every part"
        ),
        "essay": "essay questions that ask for explanation and reasoning, not recall alone",
    }
    sections = {
        "WRITE": f"{count} {kinds[answer_mode]}",
        "MARKS PER QUESTION": f"{marks_each:g}",
        "SYLLABUS CONTENT (ask only about these)": "\n".join(topics),
    }
    if examples:
        sections["REAL PAST QUESTIONS (match this style and mark structure)"] = "\n\n".join(examples)
    if resources:
        sections["RESOURCE PASSAGES (background only - do not name or quote)"] = "\n\n".join(resources)
    if avoid:
        sections["ALREADY ASKED (do not repeat)"] = "\n".join(f"- {text}" for text in avoid)
    return "\n\n".join(f"## {title}\n{body}" for title, body in sections.items())


class GeminiAuthor:
    def __init__(self, api_key: str, model: str) -> None:
        self.name = model
        self._model = model
        self._client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(
                retry_options=types.HttpRetryOptions(
                    attempts=RETRY_ATTEMPTS,
                    initial_delay=2.0,
                    max_delay=30.0,
                    http_status_codes=RETRY_STATUS_CODES,
                )
            ),
        )

    def write(self, brief: str) -> WrittenSection:
        response = self._client.models.generate_content(
            model=self._model,
            contents=brief,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=TEMPERATURE,
                max_output_tokens=MAX_OUTPUT_TOKENS,
                response_mime_type="application/json",
                response_schema=WrittenSection,
                http_options=types.HttpOptions(timeout=int(TIMEOUT_SECONDS * 1000)),
            ),
        )
        return WrittenSection.model_validate_json(response.text or "{}")


class OpenAICompatibleAuthor:
    """Works with any service that speaks the OpenAI chat API."""

    def __init__(self, api_key: str | None, base_url: str, model: str) -> None:
        self.name = model
        self._model = model
        self._client = openai.OpenAI(
            api_key=api_key or "not-needed",
            base_url=base_url,
            timeout=TIMEOUT_SECONDS,
            max_retries=RETRY_ATTEMPTS,
        )

    def write(self, brief: str) -> WrittenSection:
        response = self._client.chat.completions.create(
            model=self._model,
            temperature=TEMPERATURE,
            response_format={"type": "json_object"},
            # A whole section of questions with their marking points is a lot of JSON.
            # Without this the provider applies its own, much smaller default and the
            # reply stops mid-document, which it reports as a failed generation.
            max_completion_tokens=OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT + "\n" + json_instruction(WrittenSection)},
                {"role": "user", "content": brief},
            ],
        )
        return WrittenSection.model_validate(json.loads(response.choices[0].message.content or "{}"))


def gemini_author(api_key: str, model: str) -> QuestionAuthor:
    return GeminiAuthor(api_key, model)


def openai_compatible_author(api_key: str | None, base_url: str, model: str) -> QuestionAuthor:
    return OpenAICompatibleAuthor(api_key, base_url, model)
