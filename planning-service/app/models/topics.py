from __future__ import annotations

from sqlalchemy import CheckConstraint, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Topic(Base):
    __tablename__ = "topics"
    __table_args__ = (
        CheckConstraint("exam_weight >= 0 AND exam_weight <= 1", name="ck_topics_exam_weight"),
        UniqueConstraint("code", name="uq_topics_code"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("planning.topics.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    grade_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    exam_weight: Mapped[float] = mapped_column(nullable=False, default=0)
    prerequisites: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )

    parent: Mapped[Topic | None] = relationship(
        remote_side=lambda: Topic.id,
        back_populates="children",
    )
    children: Mapped[list[Topic]] = relationship(back_populates="parent")
