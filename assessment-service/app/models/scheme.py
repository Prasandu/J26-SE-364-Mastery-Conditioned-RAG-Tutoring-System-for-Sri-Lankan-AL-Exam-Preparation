"""Marking schemes. One paper can have several versions; each is a set of points and rules."""

from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.base import (
    CASCADE_ALL,
    JSON_DOC,
    PAPER_FK,
    QUESTION_FK,
    SCHEME_FK,
    text_enum,
    utcnow,
)
from app.models.content import ContentStatus, Paper, Question


class SchemeSource(StrEnum):
    OFFICIAL = "official"
    TEACHER = "teacher"
    GENERATED = "generated"


class PointType(StrEnum):
    MCQ_KEY = "mcq_key"
    CONCEPT = "concept"
    EQUATION = "equation"
    FORMULA = "formula"
    CALCULATION = "calculation"
    UNIT = "unit"
    DIAGRAM = "diagram"
    GRAPH = "graph"


class RuleType(StrEnum):
    MAX_MARKS = "max_marks"  # params: {"max": 4}
    ANY_N_OF = "any_n_of"  # params: {"n": 2, "points": ["P1", "P2", "P3"]}
    ERROR_CARRIED_FORWARD = "ecf"  # params: {"point": "P3", "depends_on": ["P1"]}


class MarkingScheme(Base):
    __tablename__ = "marking_schemes"
    __table_args__ = (UniqueConstraint("paper_id", "version"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey(PAPER_FK, ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer, default=1)
    source: Mapped[SchemeSource] = mapped_column(text_enum(SchemeSource))
    status: Mapped[ContentStatus] = mapped_column(text_enum(ContentStatus), default=ContentStatus.DRAFT)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    paper: Mapped[Paper] = relationship(back_populates="marking_schemes")
    points: Mapped[list["MarkingPoint"]] = relationship(
        back_populates="scheme", order_by="MarkingPoint.order_no", cascade=CASCADE_ALL
    )
    rules: Mapped[list["MarkingRule"]] = relationship(back_populates="scheme", cascade=CASCADE_ALL)
    model_answers: Mapped[list["ModelAnswer"]] = relationship(back_populates="scheme", cascade=CASCADE_ALL)


class MarkingPoint(Base):
    """One thing that earns marks, e.g. "correct moles of HCl = 2.00 x 10^-3 mol" (1 mark)."""

    __tablename__ = "marking_points"
    __table_args__ = (UniqueConstraint("scheme_id", "question_id", "code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    scheme_id: Mapped[int] = mapped_column(ForeignKey(SCHEME_FK, ondelete="CASCADE"))
    question_id: Mapped[int] = mapped_column(ForeignKey(QUESTION_FK, ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(20))  # "P1", "P2"...
    description: Mapped[str] = mapped_column(Text)
    marks: Mapped[float] = mapped_column(Float)
    point_type: Mapped[PointType] = mapped_column(text_enum(PointType))
    # What code can check, e.g. {"value": 0.08, "unit": "mol dm-3", "tolerance_pct": 1}
    expected: Mapped[dict[str, Any] | None] = mapped_column(JSON_DOC)
    alternatives: Mapped[list[str]] = mapped_column(JSON_DOC, default=list)  # other accepted answers
    order_no: Mapped[int] = mapped_column(Integer, default=0)

    scheme: Mapped[MarkingScheme] = relationship(back_populates="points")
    question: Mapped[Question] = relationship()


class MarkingRule(Base):
    __tablename__ = "marking_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    scheme_id: Mapped[int] = mapped_column(ForeignKey(SCHEME_FK, ondelete="CASCADE"), index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey(QUESTION_FK, ondelete="CASCADE"), index=True)
    rule_type: Mapped[RuleType] = mapped_column(text_enum(RuleType))
    params: Mapped[dict[str, Any]] = mapped_column(JSON_DOC, default=dict)

    scheme: Mapped[MarkingScheme] = relationship(back_populates="rules")
    question: Mapped[Question] = relationship()


class ModelAnswer(Base):
    __tablename__ = "model_answers"
    __table_args__ = (UniqueConstraint("scheme_id", "question_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    scheme_id: Mapped[int] = mapped_column(ForeignKey(SCHEME_FK, ondelete="CASCADE"))
    question_id: Mapped[int] = mapped_column(ForeignKey(QUESTION_FK, ondelete="CASCADE"), index=True)
    answer_text: Mapped[str] = mapped_column(Text)

    scheme: Mapped[MarkingScheme] = relationship(back_populates="model_answers")
    question: Mapped[Question] = relationship()
