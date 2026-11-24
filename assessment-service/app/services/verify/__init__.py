"""Independent verification of generated questions and marking schemes.

The pass is deliberately separate from the generator: the thing that wrote a question
is the last thing that should be trusted to mark its own work.

    facts     one shape for a question, whether it came from a model or the database
    checks    the deterministic validators, each with a documented scope
    pipeline  the staged pass, including the optional AI critique
    report    what was found, and how strongly

Nothing here claims to prove a question is chemically correct. It catches the
preventable mistakes and leaves a traceable reason for every rejection.
"""

from app.services.verify.facts import PointFacts, QuestionFacts, from_scheme, from_written
from app.services.verify.pipeline import Verified, verify_paper, verify_question
from app.services.verify.report import (
    Finding,
    Severity,
    VerificationReport,
    error,
    for_teacher,
    note,
    stored_reasons,
)

__all__ = [
    "Finding",
    "PointFacts",
    "QuestionFacts",
    "Severity",
    "VerificationReport",
    "Verified",
    "error",
    "for_teacher",
    "from_scheme",
    "from_written",
    "note",
    "stored_reasons",
    "verify_paper",
    "verify_question",
]
