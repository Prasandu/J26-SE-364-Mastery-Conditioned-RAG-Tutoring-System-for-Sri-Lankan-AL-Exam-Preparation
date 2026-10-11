from datetime import datetime
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Float, ForeignKey, Index, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Prediction(Base):
    __tablename__ = "predictions"
    __table_args__ = (Index("ix_predictions_student_created", "student_id", "created_at"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    student_id: Mapped[str] = mapped_column(String(120), nullable=False)
    topic_id: Mapped[str | None] = mapped_column(
        ForeignKey("planning.topics.id", ondelete="SET NULL"),
        nullable=True,
    )
    predicted_score: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    contributing_factors: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    model_version: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class ProfileEmbedding(Base):
    __tablename__ = "profile_embeddings"

    student_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    embedding: Mapped[list[float]] = mapped_column(Vector(16), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
