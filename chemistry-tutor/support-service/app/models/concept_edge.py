from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ConceptEdge(Base):
    """A directed prerequisite edge: concept_id requires prerequisite_id
    to be understood first.
    """

    __tablename__ = "concept_edges"

    id: Mapped[int] = mapped_column(primary_key=True)
    concept_id: Mapped[str] = mapped_column(String(50), ForeignKey("concepts.concept_id"), index=True)
    prerequisite_id: Mapped[str] = mapped_column(String(50), ForeignKey("concepts.concept_id"))
