"""Shapes for managing and searching trusted Chemistry resources. Admin only."""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.models import ExtractionQuality, ResourceStatus

Code = Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$", examples=["chem-11-resource-book"])]


class ResourceSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    version: int
    title: str
    subject: str
    topic_code: str | None
    status: ResourceStatus
    page_count: int
    created_by: str
    created_at: datetime


class PageReportOut(BaseModel):
    page: int
    quality: ExtractionQuality
    chars: int


class IngestResultOut(BaseModel):
    resource: ResourceSummaryOut | None  # None when the file was unchanged
    created: bool
    chunks_created: int
    chunks_reused: int
    thin_pages: list[PageReportOut]


class EmbedResultOut(BaseModel):
    embedded: int
    still_pending: int
    failures: list[str]


class PassageOut(BaseModel):
    chunk_id: int
    resource_code: str
    resource_title: str
    resource_version: int
    page_number: int | None
    heading: str | None
    text: str
    similarity: float


class SearchResultOut(BaseModel):
    passages: list[PassageOut]
    query_embedded: bool
    elapsed_seconds: float
