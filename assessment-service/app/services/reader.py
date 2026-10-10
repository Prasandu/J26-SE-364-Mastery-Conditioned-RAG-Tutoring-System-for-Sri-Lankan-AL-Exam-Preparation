"""Reading a photo of a handwritten answer into text (paper mode).

The reader only transcribes. It must not solve the question, tidy the chemistry or
correct the student's mistakes: a wrong formula has to stay wrong, or the marking
engine would be grading the model's chemistry instead of the student's.

Needs a model that can see images, which is why it is configured separately from
the AI judge: Groq's text models cannot read pictures, Gemini can.
"""

import base64
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

import openai
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from app.services.judge import RETRY_ATTEMPTS, RETRY_STATUS_CODES, json_instruction

UNCLEAR_MARK = "[?]"


@dataclass(frozen=True)
class ReadRequest:
    image: bytes
    content_type: str
    question: str | None = None  # the wording helps the model expect the right chemistry


class ReadResult(BaseModel):
    text: str  # the transcription, exactly as written
    confidence: float = Field(ge=0, le=1)
    unclear: list[str] = []  # parts that could not be read with certainty
    has_drawing: bool = False  # a diagram or graph that cannot be written out as text


JSON_INSTRUCTION = json_instruction(ReadResult)


class AnswerReader(Protocol):
    name: str  # stored with the answer, so results stay traceable

    def read(self, request: ReadRequest) -> ReadResult: ...


SYSTEM_PROMPT = f"""\
You transcribe handwritten Sri Lankan A/L Chemistry answers into text, exactly as written.

Rules:
1. Copy what is on the page. Do NOT answer the question, do NOT finish incomplete working and
   do NOT correct the student's chemistry, spelling, arithmetic or units. A mistake must stay
   a mistake, because the transcription is marked afterwards.
2. Write chemistry in plain standard notation: H2SO4, SO4^2-, Ca^2+, NaOH(aq), -> for a reaction
   arrow, <=> for an equilibrium, 2.00 x 10^-3 for powers of ten, mol dm-3 for units.
3. Keep the student's line breaks and the order of their working.
4. Where a word or symbol cannot be read with certainty, write {UNCLEAR_MARK} in its place and
   list what was unclear in `unclear`.
5. Set has_drawing to true if the answer contains a diagram, structure or graph that cannot be
   written out as text. Describe it in one short line inside the text, in square brackets.
6. confidence: 0 to 1, how sure you are that the whole transcription is right.
"""


def build_user_prompt(question: str | None) -> str:
    if not question:
        return "Transcribe this handwritten answer."
    return f"The student was answering this question:\n{question}\n\nTranscribe their handwritten answer."


class GeminiReader:
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

    def read(self, request: ReadRequest) -> ReadResult:
        response = self._client.models.generate_content(
            model=self._model,
            contents=[
                types.Part.from_bytes(data=request.image, mime_type=request.content_type),
                build_user_prompt(request.question),
            ],
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0,
                response_mime_type="application/json",
                response_schema=ReadResult,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            ),
        )
        return ReadResult.model_validate_json(response.text or "")


class OpenAICompatibleReader:
    """Any service that speaks the OpenAI chat API and accepts images."""

    def __init__(self, api_key: str | None, base_url: str, model: str) -> None:
        self.name = model
        self._model = model
        self._client = openai.OpenAI(
            api_key=api_key or "not-needed",
            base_url=base_url,
            max_retries=RETRY_ATTEMPTS,
            timeout=180.0,  # reading a page takes longer than judging text
        )

    def read(self, request: ReadRequest) -> ReadResult:
        data_url = f"data:{request.content_type};base64,{base64.b64encode(request.image).decode()}"
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": f"{SYSTEM_PROMPT}\n{JSON_INSTRUCTION}"},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": build_user_prompt(request.question)},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                },
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
        return ReadResult.model_validate_json(response.choices[0].message.content or "")


@lru_cache
def gemini_reader(api_key: str, model: str) -> GeminiReader:
    return GeminiReader(api_key, model)


@lru_cache
def openai_compatible_reader(api_key: str | None, base_url: str, model: str) -> OpenAICompatibleReader:
    return OpenAICompatibleReader(api_key, base_url, model)
