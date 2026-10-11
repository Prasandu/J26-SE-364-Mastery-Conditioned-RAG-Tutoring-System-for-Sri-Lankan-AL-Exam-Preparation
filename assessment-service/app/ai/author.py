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

from app.ai.judge import RETRY_ATTEMPTS, RETRY_STATUS_CODES, json_instruction

TIMEOUT_SECONDS = 180.0
MAX_OUTPUT_TOKENS = 32768
# Some variety is wanted here, unlike marking, where the same answer must always be
# judged the same way.
TEMPERATURE = 0.7


class WrittenOption(BaseModel):
    label: str
    text: str


class WrittenPoint(BaseModel):
    code: str = Field(description="P1, P2, ... or K for a multiple choice key")
    description: str = Field(description="What earns this mark, in the examiner's words")
    marks: float
    point_type: str = Field(description="mcq_key, concept, equation, formula, calculation or unit")


class WrittenQuestion(BaseModel):
    label: str = Field(description='"1", "2" ... within the section')
    text: str
    topic_code: str = Field(description="The syllabus topic this question tests")
    options: list[WrittenOption] = Field(default_factory=list, description="Multiple choice only")
    answer: str = Field(description="The full model answer")
    points: list[WrittenPoint]


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
9. Where real past questions are shown, follow their style, difficulty and the way their
   marks are split. Do not copy them.
"""


def build_brief(
    *,
    answer_mode: str,
    count: int,
    marks_each: float,
    topics: list[str],
    avoid: list[str],
    examples: list[str] | None = None,
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
