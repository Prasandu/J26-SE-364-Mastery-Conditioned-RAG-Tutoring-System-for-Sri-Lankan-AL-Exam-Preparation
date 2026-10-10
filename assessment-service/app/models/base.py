"""Pieces shared by every table module: column helpers and foreign key names."""

from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import JSON, Enum
from sqlalchemy.dialects.postgresql import JSONB

QUESTION_FK = "questions.id"
SCHEME_FK = "marking_schemes.id"
ATTEMPT_FK = "attempts.id"
PAPER_FK = "papers.id"
ANSWER_FK = "answers.id"
CASCADE_ALL = "all, delete-orphan"

# JSONB on Postgres (indexable, faster); plain JSON on SQLite (tests).
JSON_DOC = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(UTC)


def text_enum(enum_cls: type[StrEnum]) -> Enum:
    # Stored as plain text so the same tables work on SQLite and Postgres.
    return Enum(
        enum_cls,
        native_enum=False,
        length=20,
        values_callable=lambda members: [m.value for m in members],
    )
