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
    EdgeKind,
    EdgeStatus,
    Paper,
    PaperKind,
    Question,
    Section,
    Topic,
    TopicEdge,
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
from app.models.topic_suggestion import SuggestionStatus, TopicSuggestion
from app.models.users import User, UserRole

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
    "EdgeKind",
    "EdgeStatus",
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
    "SuggestionStatus",
    "TopicSuggestion",
    "Topic",
    "TopicEdge",
    "User",
    "UserRole",
    "question_topics",
    "utcnow",
]
