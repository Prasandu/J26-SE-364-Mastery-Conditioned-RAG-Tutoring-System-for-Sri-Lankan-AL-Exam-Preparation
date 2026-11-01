"""Typed views of API requests, built only after JSON Schema validation (contracts.py).

Enumerations (modes, levels, locales, action codes) are deliberately plain ``str`` here: their
allowed values come from the exported @vlab/contracts schemas, so they cannot drift.
"""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class PreLabSubmission(_Model):
    answers: dict[str, str]
    prediction: str
    acknowledgedSafety: list[str]


class CreateSessionRequest(_Model):
    experimentId: str
    experimentVersion: str
    assessmentVersion: str
    mode: str
    guidanceLevel: str | None
    locale: str
    preLab: PreLabSubmission | None


class SubmittedEnvelope(_Model):
    action: dict[str, Any]
    actor: str
    acknowledgedSafetyWarning: bool


class ActionSubmission(_Model):
    clientActionId: UUID
    expectedSequence: int
    envelope: SubmittedEnvelope
    preview: bool


class NotebookSaveRequest(_Model):
    expectedVersion: int
    document: dict[str, Any]


class AssistantAskRequest(_Model):
    sessionId: UUID
    question: str
    locale: str
