"""Reading a photo of a handwritten answer into text (paper mode).

The reader only transcribes. It must not solve the question, tidy the chemistry or
correct the student's mistakes: a wrong formula has to stay wrong, or the marking
engine would be grading the model's chemistry instead of the student's.
"""

import logging
from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel, Field

from app.ai.vision import Image, VisionModel

logger = logging.getLogger(__name__)

UNCLEAR_MARK = "[?]"
# Marks a drawing in the transcription. Deliberately a word, not another bracketed
# symbol: a model told to use [?] for unreadable writing will otherwise use it for
# diagrams too, and a drawing that reads as "could not be read" tells nobody anything.
DRAWING_MARK = "drawing"


@dataclass(frozen=True)
class ReadRequest:
    image: bytes
    content_type: str
    question: str | None = None  # the wording helps the model expect the right chemistry
    # What the syllabus says this question's topic and its prerequisites cover.
    # Narrows what the reader expects to see, so an ambiguous "N03" is read as the
    # nitrate the topic is actually about (see app/services/topic_graph.py).
    syllabus: tuple[str, ...] = ()


class ReadResult(BaseModel):
    text: str  # the transcription, exactly as written
    confidence: float = Field(ge=0, le=1)
    unclear: list[str] = []  # parts that could not be read with certainty
    has_drawing: bool = False  # a diagram or graph that cannot be written out as text
    # Each drawn structural formula as SMILES, so it can be marked as a molecular
    # graph rather than judged from its description (app/services/chemistry/structures.py).
    structures: list[str] = []


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
   list what was unclear in `unclear`. This is only for handwriting you cannot make out -
   never for a drawing, which rule 6 covers instead.
5. If the answer contains a table (e.g. titration burette readings), reproduce it as a plain
   text table: one header row, then one data row per line, every row with the exact same
   number of " | " separators as the header. If a cell has more than one line of writing,
   join those lines with "; " so the cell still fits on its one row. Never start a new row
   partway through a cell, and never leave a row with fewer columns than the header. Example:
   Trial | Initial (cm3) | Final (cm3)
   1 | 0.00 | 20.10
   2 | 0.00 | 20.00
6. A drawing is not unreadable handwriting. A structure, diagram, graph, mechanism arrow or
   resonance form must NEVER be written {UNCLEAR_MARK}. Instead set has_drawing to true and
   describe each one where it appears, on its own line, as [{DRAWING_MARK}: ...] - say what is
   drawn, with the labels, charges and arrows you can see, so a teacher knows what to look for
   in the photo. Example:
   [{DRAWING_MARK}: benzene ring with OH at the top, negative charge on a ring carbon, curved
   arrow from that carbon towards the ring]
7. A drawn structural formula also goes into `structures`, one SMILES per structure, in
   the order drawn. Keep the [{DRAWING_MARK}: ...] line as well - the SMILES is for marking,
   the description is for the teacher.
   - A charge belongs ON its atom inside brackets: [C+], [CH2+], [CH2-], [O-]. Never write a
     charge as an atom of its own: "CC1(CCCCC1)[+]" is wrong, "C[C+]1CCCCC1" is right.
   - Every ring digit you open must close again, and each SMILES must parse on its own.
   - A curved arrow shows electron movement, not an atom. Leave arrows out of the SMILES.
   - Leave out anything you cannot write with confidence, rather than guessing a structure.
   A graph, apparatus sketch or energy profile is not a structural formula: describe those
   in the text and leave `structures` empty for them.
8. confidence: 0 to 1, how sure you are that the whole transcription is right.
"""


def build_user_prompt(question: str | None, syllabus: tuple[str, ...] = ()) -> str:
    parts = []
    if question:
        parts.append(f"The student was answering this question:\n{question}")
    if syllabus:
        # Context for reading, never an answer key: it says which chemistry is in
        # scope, so an ambiguous mark is read as a species this topic actually uses.
        covered = "\n".join(f"- {line}" for line in syllabus)
        parts.append(
            f"The syllabus for this question, and for what it builds on, covers:\n{covered}\n"
            "Use this only to read ambiguous handwriting and formulae. Do not correct the "
            "student towards it, and do not write anything they did not put on the page."
        )
    parts.append("Transcribe their handwritten answer.")
    return "\n\n".join(parts)


class VisionAnswerReader:
    """Reads handwriting with any vision model."""

    def __init__(self, model: VisionModel) -> None:
        self._model = model
        self.name = model.name

    def read(self, request: ReadRequest) -> ReadResult:
        return self._model.ask(
            system=SYSTEM_PROMPT,
            user=build_user_prompt(request.question, request.syllabus),
            images=[Image(request.image, request.content_type)],
            shape=ReadResult,
        )


class FallbackReader:
    """Tries each reader in turn, moving to the next only if one raises.

    Built for a primary vision model that is often rate limited (a free-tier daily
    quota): the student's upload still succeeds, read by whichever reader actually
    answered, instead of failing just because the first one was busy.
    """

    def __init__(self, readers: list[AnswerReader]) -> None:
        if not readers:
            raise ValueError("FallbackReader needs at least one reader")
        self._readers = readers
        self.name = readers[0].name  # updated to whichever reader last succeeded

    def read(self, request: ReadRequest) -> ReadResult:
        last_error: Exception | None = None
        for reader in self._readers:
            try:
                result = reader.read(request)
            except Exception as error:  # try the next reader instead of failing outright
                # Logged here, not just left to whoever raises last: otherwise only the
                # final reader's error ever surfaces, hiding why the earlier ones failed.
                logger.warning("Reader %r failed, trying the next one: %s", reader.name, error)
                last_error = error
                continue
            self.name = reader.name
            return result
        assert last_error is not None  # readers is never empty, so this always ran at least once
        raise last_error
