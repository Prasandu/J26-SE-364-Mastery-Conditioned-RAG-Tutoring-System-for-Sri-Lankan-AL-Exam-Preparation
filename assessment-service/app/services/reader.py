"""Reading a photo of a handwritten answer into text (paper mode).

The reader only transcribes. It must not solve the question, tidy the chemistry or
correct the student's mistakes: a wrong formula has to stay wrong, or the marking
engine would be grading the model's chemistry instead of the student's.
"""

from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel, Field

from app.services.vision import Image, VisionModel

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


class VisionAnswerReader:
    """Reads handwriting with any vision model."""

    def __init__(self, model: VisionModel) -> None:
        self._model = model
        self.name = model.name

    def read(self, request: ReadRequest) -> ReadResult:
        return self._model.ask(
            system=SYSTEM_PROMPT,
            user=build_user_prompt(request.question),
            images=[Image(request.image, request.content_type)],
            shape=ReadResult,
        )
