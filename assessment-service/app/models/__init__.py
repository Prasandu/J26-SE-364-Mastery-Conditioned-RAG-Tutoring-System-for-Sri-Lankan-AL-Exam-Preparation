"""Database tables, grouped by what they describe.

content: Paper -> Section -> Question (tree of sub-questions)
scheme:  MarkingScheme (versioned, per paper) -> MarkingPoint / MarkingRule / ModelAnswer
attempts: Attempt -> Answer -> PointResult / AnswerImage

Everything is re-exported here, so the rest of the app imports from `app.models`
and never needs to know which module a table lives in.
"""

from app.models.attempts import (
    Answer,
    AnswerImage,
    Attempt,
    AttemptMode,
    AttemptStatus,
    MarkingMethod,
    PointResult,
    PointReview,
    PointStatus,
)
from app.models.base import JSON_DOC, utcnow
from app.models.content import (
    AnswerMode,
    ContentStatus,
    Paper,
    PaperKind,
    Question,
    Section,
    Topic,
    question_topics,
)
from app.models.resources import (
    EMBEDDING_DIMENSIONS,
    ExtractionQuality,
    Resource,
    ResourceChunk,
    ResourceStatus,
)
from app.models.scheme import (
    EDITABLE,
    SCHEME_TRANSITIONS,
    MarkingPoint,
    MarkingRule,
    MarkingScheme,
    ModelAnswer,
    PointType,
    RuleType,
    SchemeSource,
    SchemeStatus,
)

__all__ = [
    "EDITABLE",
    "EMBEDDING_DIMENSIONS",
    "JSON_DOC",
    "SCHEME_TRANSITIONS",
    "Answer",
    "AnswerImage",
    "AnswerMode",
    "Attempt",
    "AttemptMode",
    "AttemptStatus",
    "ContentStatus",
    "MarkingMethod",
    "MarkingPoint",
    "MarkingRule",
    "MarkingScheme",
    "ModelAnswer",
    "Paper",
    "PaperKind",
    "PointResult",
    "PointReview",
    "PointStatus",
    "PointType",
    "ExtractionQuality",
    "Question",
    "Resource",
    "ResourceChunk",
    "ResourceStatus",
    "RuleType",
    "SchemeSource",
    "SchemeStatus",
    "Section",
    "Topic",
    "question_topics",
    "utcnow",
]
