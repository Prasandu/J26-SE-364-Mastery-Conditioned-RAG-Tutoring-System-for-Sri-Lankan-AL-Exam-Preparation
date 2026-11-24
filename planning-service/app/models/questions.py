from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Paper(Base):
    __tablename__ = "papers"
    __table_args__ = (
        CheckConstraint("year >= 1900 AND year <= 2200", name="ck_papers_year"),
        CheckConstraint("total_marks > 0", name="ck_papers_total_marks"),
    )

    paper_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[str] = mapped_column(String(80), nullable=False)
    total_marks: Mapped[float] = mapped_column(Float, nullable=False)


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (CheckConstraint("max_marks > 0", name="ck_questions_max_marks"),)

    question_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    paper_id: Mapped[str] = mapped_column(
        ForeignKey("planning.papers.paper_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_no: Mapped[str] = mapped_column(String(40), nullable=False)
    topic_id: Mapped[str] = mapped_column(
        ForeignKey("planning.topics.id", ondelete="RESTRICT"),
        nullable=False,
    )
    sub_topic_id: Mapped[str | None] = mapped_column(
        ForeignKey("planning.topics.id", ondelete="SET NULL"),
        nullable=True,
    )
    max_marks: Mapped[float] = mapped_column(Float, nullable=False)


class Attempt(Base):
    __tablename__ = "attempts"
    __table_args__ = {"info": {"is_view": True}}

    attempt_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    student_id: Mapped[str] = mapped_column(String(120), nullable=False)
    question_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    topic_id: Mapped[str] = mapped_column(String(80), nullable=False)
    marks: Mapped[float] = mapped_column(Float, nullable=False)
    max_marks: Mapped[float] = mapped_column(Float, nullable=False)
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    paper_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    paper_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
