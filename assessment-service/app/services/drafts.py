"""Turning extracted pages into the paper body the admin API accepts.

A plan file says how the pages map onto sections, because a scanned page does not
say which part of the paper it belongs to.
"""

import json
import re
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models import AnswerMode, PaperKind
from app.schemas.admin import PaperIn

# Papers print option labels as "(1)" or "1."; the answer key prints plain "1".
_LABEL_EDGES = re.compile(r"^[\s(\[]+|[\s)\].]+$")


class SectionPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    title: str
    answer_mode: AnswerMode
    choose_count: int | None = None
    instructions: str | None = None
    marks_each: float | None = Field(default=None, description="Marks per question, when the paper is even")
    drafts: list[Path] = Field(min_length=1, description="Draft files from app.import_pdf, in order")


class PaperPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    kind: PaperKind = PaperKind.PAST
    year: int | None = None
    subject: str = "chemistry"
    sections: list[SectionPlan] = Field(min_length=1)


def clean_label(label: str) -> str:
    """ "(1)" and "1." both become "1"."""
    return _LABEL_EDGES.sub("", label).strip()


def load_plan(path: Path) -> PaperPlan:
    plan = PaperPlan.model_validate_json(path.read_text(encoding="utf-8"))
    for section in plan.sections:
        section.drafts = [
            path.parent / draft if not draft.is_absolute() else draft for draft in section.drafts
        ]
    return plan


def build_paper(plan: PaperPlan) -> PaperIn:
    """The plan plus its draft files as one body for POST /admin/papers."""
    return PaperIn.model_validate(
        {
            "title": plan.title,
            "kind": plan.kind,
            "year": plan.year,
            "subject": plan.subject,
            "sections": [_section(section) for section in plan.sections],
        }
    )


def _section(plan: SectionPlan) -> dict[str, Any]:
    questions = [
        _question(question, plan)
        for draft in plan.drafts
        for part in _extracted(draft)
        for question in part.get("questions", [])
    ]
    return {
        "code": plan.code,
        "title": plan.title,
        "answer_mode": plan.answer_mode,
        "choose_count": plan.choose_count,
        "instructions": plan.instructions,
        "questions": questions,
    }


def _question(extracted: dict[str, Any], plan: SectionPlan) -> dict[str, Any]:
    subs = [_question(sub, plan) for sub in extracted.get("sub_questions") or []]
    options = [
        {"label": clean_label(option["label"]), "text": option["text"]}
        for option in extracted.get("options") or []
    ]
    marks = extracted.get("max_marks")
    if marks is None and not subs:
        marks = plan.marks_each
    return {
        "label": clean_label(extracted["label"]),
        "text": extracted.get("text", ""),
        "max_marks": marks,
        "options": options or None,
        "sub_questions": subs,
    }


def _extracted(draft: Path) -> list[dict[str, Any]]:
    data = json.loads(draft.read_text(encoding="utf-8"))
    if data.get("kind") != "paper":
        raise ValueError(f"{draft.name} was imported as '{data.get('kind')}', not 'paper'")
    return data.get("extracted", [])
