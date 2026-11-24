from datetime import UTC, datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    source_filename: Mapped[str] = mapped_column(String(255))
    checksum: Mapped[str] = mapped_column(String(64), unique=True)
    grade: Mapped[str] = mapped_column(String(20))
    document_type: Mapped[str] = mapped_column(String(50))
    version: Mapped[str] = mapped_column(String(50), default="1")
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
