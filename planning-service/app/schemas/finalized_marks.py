"""assessment.criterion.finalized v1 - finalized official marks pulled from the assessment
service (DAT-010; shared/contracts/assessment-criterion-finalized.v1.json).

Validation is strict about anything that decides whose evidence this is and what it is
worth (ids, versions, score, timestamps), and lenient about additive fields: unknown keys
are ignored within major version 1, and any other major version is refused.
"""

import re
import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Published in the contract (x-eventIdNamespace); event ids are derivable from it.
EVENT_NAMESPACE = uuid.UUID("5b0f0c34-6a8e-4c2b-9d1f-2a7e3c4b5d6e")
SUPPORTED_MAJOR_VERSION = 1
# Official, non-generative decisions. Anything else (e.g. a legacy AI-judged mark) is
# recorded as legacy_unverified and never becomes mastery evidence.
TRUSTED_EVIDENCE_CLASSES = frozenset({"deterministic", "teacher_verified"})
_ENTITY = re.compile(r"^attempt/[0-9a-fA-F-]{36}/point/[^/]{1,80}$")
_VERSION = re.compile(r"^(\d+)\.\d+\.\d+$")
TopicCode = Annotated[str, Field(min_length=1, max_length=80)]


def event_id_for(source_entity_id: str, source_version: int) -> str:
    """The id the producer gives version `source_version` of a point's decision."""
    return str(uuid.uuid5(EVENT_NAMESPACE, f"{source_entity_id}#{source_version}"))


def _major(version: str) -> int | None:
    match = _VERSION.match(version)
    return int(match.group(1)) if match else None


class FinalizedScore(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    awarded: Annotated[float, Field(ge=0, allow_inf_nan=False)]
    maximum: Annotated[float, Field(gt=0, allow_inf_nan=False)]

    @model_validator(mode="after")
    def awarded_within_maximum(self) -> "FinalizedScore":
        if self.awarded > self.maximum:
            raise ValueError("score.awarded must not exceed score.maximum")
        return self


class FinalizedMarkEvent(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    schema_version: str
    event_id: uuid.UUID
    event_type: Literal["assessment.criterion.finalized"]
    producer: Literal["assessment-service"]
    subject_user_id: uuid.UUID
    source_entity_id: Annotated[str, Field(max_length=200)]
    source_version: Annotated[int, Field(ge=0)]
    source_topic_codes: Annotated[list[TopicCode], Field(max_length=50)]
    status: Literal["final"]
    # Not restricted here on purpose: an untrusted class must be recorded, not dropped.
    evidence_class: Annotated[str, Field(min_length=1, max_length=40)]
    score: FinalizedScore
    paper_id: int
    assessed_at: datetime
    occurred_at: datetime

    @field_validator("schema_version")
    @classmethod
    def supported_major_version(cls, value: str) -> str:
        if _major(value) != SUPPORTED_MAJOR_VERSION:
            raise ValueError(f"unsupported schema_version {value!r}; this consumer reads 1.x.y")
        return value

    @field_validator("source_entity_id")
    @classmethod
    def entity_shape(cls, value: str) -> str:
        if not _ENTITY.match(value):
            raise ValueError("source_entity_id must be attempt/<uuid>/point/<code>")
        return value

    @field_validator("assessed_at", "occurred_at")
    @classmethod
    def aware_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamps must include a timezone")
        return value.astimezone(UTC)

    @model_validator(mode="after")
    def id_is_derived_from_entity_and_version(self) -> "FinalizedMarkEvent":
        # Lets the consumer find every version of a point, and stops an event from
        # borrowing another decision's id.
        if str(self.event_id) != event_id_for(self.source_entity_id, self.source_version):
            raise ValueError("event_id is not the contract's id for source_entity_id and source_version")
        return self


class FinalizedMarkPage(BaseModel):
    """The feed page around the events. Events stay raw here: each is validated on its own,
    so one bad event is rejected and recorded instead of failing the whole page."""

    model_config = ConfigDict(extra="ignore")

    schema_version: str
    events: Annotated[list[dict], Field(max_length=2000)]
    next_cursor: Annotated[str, Field(max_length=200)] | None = None
    has_more: bool = False

    @field_validator("schema_version")
    @classmethod
    def supported_major_version(cls, value: str) -> str:
        if _major(value) != SUPPORTED_MAJOR_VERSION:
            raise ValueError(f"unsupported feed schema_version {value!r}")
        return value


class PullReport(BaseModel):
    """Counts only - never event payloads, student data beyond counts, or credentials."""

    pages: int = 0
    applied: int = 0
    duplicates: int = 0
    superseded: int = 0
    stale: int = 0
    quarantined: int = 0
    legacy_unverified: int = 0
    rejected: int = 0
    released: int = 0
    mastery_changes: int = 0
    replans_flagged: int = 0
    high_water: datetime | None = None


class FeedStatus(BaseModel):
    """For monitoring the C2 -> C3 synchronisation (no keys, no student data)."""

    configured: bool  # ASSESSMENT_SERVICE_URL and ASSESSMENT_SERVICE_API_KEY both set
    high_water: datetime | None
    last_run_at: datetime | None
    last_success_at: datetime | None
    last_error: str | None
    seconds_since_success: float | None
    quarantined_events: int


class QuarantinedCode(BaseModel):
    code: str
    events: int
    students: int


class QuarantineSummary(BaseModel):
    quarantined_events: int
    legacy_unverified_events: int
    rejected_events: int
    unmapped_codes: list[QuarantinedCode]
