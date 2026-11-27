"""TUT-014 Mode A/C: the grounded tutor answers as a structured TeachingResponse.

The model sees the same retrieved NIE passages and anti-injection rules as the plain
tutor, and is asked for JSON in the TeachingResponse 1.1 shape. Nothing it returns is
shown until app/services/teaching/actions.py has validated it: shape, allowed blocks,
recomputed calculations, balanced equations, citations limited to the passages actually
retrieved for this question, no markup or links. If anything fails, the caller falls back
to the plain grounded answer - an unverified whiteboard is never rendered.

The tutor only explains; it has no access to assessment records and cannot award marks.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.services.teaching.actions import ValidatedTeaching, validate_teaching_response

WHITEBOARD_INSTRUCTION = """
Return ONLY one JSON object - no text before or after it, no code fences - in this shape:
{{"schema_version": "1.1", "response_id": "r1", "language": "{language}",
 "learning_mode": "quick_explanation",
 "spoken_text": "2-5 plain sentences answering the question",
 "citations": [{{"source_id": "number of a context passage you used, e.g. 1", "page": null}}],
 "blocks": [
   {{"type": "text", "text": "a short explanation paragraph"}},
   {{"type": "table", "caption": "", "headers": ["..."], "rows": [["..."]]}},
   {{"type": "chem_equation", "reactants": [{{"coefficient": 1, "formula": "Na2CO3"}}],
     "products": [{{"coefficient": 1, "formula": "CO2"}}], "arrow": "->"}}],
 "verified_steps": [{{"id": "s1", "kind": "calculation", "label": "...",
                      "formula": "n = 26.5 / 106", "result": "0.250 mol"}}],
 "visual_actions": [{{"type": "writeEquation", "step_id": "s1"}}]}}
Rules: plain text only - no HTML, markdown or links. Use only the blocks you need.
Cite only the numbers of the context passages above. Write ion charges with a caret
(SO4^2-, Fe^3+). Balance every equation. A calculation step's formula is
"name = arithmetic" using numbers or earlier step names; its result is the value and unit.
"""

LEVEL_GUIDANCE = {
    "weak": "Start from the fundamentals and use small steps.",
    "developing": "Use a normal A/L level of detail.",
    "strong": "Be concise and focus on exam-level detail.",
}


def learner_level_line(level: str | None) -> str:
    """Mastery from the student's planner changes only the depth of the explanation."""
    if level not in LEVEL_GUIDANCE:
        return ""
    return f"\nThe student's recorded mastery of this topic is {level}. {LEVEL_GUIDANCE[level]}\n"


def parse_json_object(text: str) -> dict[str, Any] | None:
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def structured_answer(
    *,
    system_prompt: str,
    question: str,
    language: str,
    passage_count: int,
    provider: Any,
) -> ValidatedTeaching:
    raw = provider.generate_response(
        system_prompt + WHITEBOARD_INSTRUCTION.format(language=language), question, max_tokens=1500
    )
    data = parse_json_object(raw)
    if data is None:
        return ValidatedTeaching(status="rejected", response=None, problems=["the answer was not valid JSON"])
    if data.get("language") != language:
        return ValidatedTeaching(
            status="rejected", response=None, problems=["the answer is not in the requested language"]
        )
    allowed = {str(number) for number in range(1, passage_count + 1)}
    return validate_teaching_response(data, allowed_source_ids=allowed)
