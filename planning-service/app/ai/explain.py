"""Template-driven explanations for study plans and profile-similarity retrieval."""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping, Sequence
from typing import Any

_ALLOWED_TOKENS = {
    "the",
    "this",
    "plan",
    "focuses",
    "on",
    "with",
    "for",
    "and",
    "study",
    "week",
    "days",
    "exam",
    "before",
    "target",
    "grade",
    "review",
    "practice",
    "past",
    "paper",
    "paperwork",
    "balanced",
    "priority",
    "strongest",
    "students",
    "student",
    "similar",
    "peers",
    "profile",
    "mix",
}


def build_template_explanation(
    plan: Mapping[str, Any],
    *,
    similar_students: Sequence[Mapping[str, Any]] | None = None,
) -> str:
    """Create a stable explanation that stays anchored to the actual plan."""
    plan_topics = _collect_topic_ids(plan)
    exam_date = _extract_value(plan, "exam_date") or "the upcoming exam"
    target_grade = _extract_value(plan, "target_grade") or "the target grade"
    mode = _extract_value(plan, "mode") or "planned"
    if plan_topics:
        top_topics = ", ".join(plan_topics[:3])
        topic_clause = f"It prioritises {top_topics} before the exam."
    else:
        topic_clause = "It keeps the study effort focused on the selected learning goals."
    similar_clause = ""
    if similar_students:
        matched = similar_students[0]
        shared = matched.get("strategy") or "a balanced review pattern"
        similar_clause = f" Similar peers leaned toward {shared}."
    return (
        f"This {mode} plan is aimed at {target_grade} and is scheduled before {exam_date}. "
        f"{topic_clause}{similar_clause}"
    )


def validate_explanation(plan: Mapping[str, Any], explanation: str) -> bool:
    """Reject explanations that mention plan-external topics, times, or numbers."""
    explanation_lower = explanation.lower()
    plan_topics = {str(topic).lower() for topic in _collect_topic_ids(plan)}
    allowed_numeric_values = {str(value).lower() for value in _collect_numeric_values(plan)}
    allowed_date_tokens = {str(value).lower() for value in _collect_date_tokens(plan)}

    cleaned_tokens = []
    for raw in re.findall(r"[a-z0-9_.-]+", explanation_lower):
        token = raw.strip(".:-_ ")
        if token:
            cleaned_tokens.append(token)

    for token in cleaned_tokens:
        if token in _ALLOWED_TOKENS or token in {"", "this", "plan", "before"}:
            continue
        if token in plan_topics:
            continue
        if token in allowed_numeric_values or token in allowed_date_tokens:
            continue
        if token.isdigit() or re.fullmatch(r"\d{1,2}:\d{2}", token):
            return False
        if re.fullmatch(r"\d+", token):
            return False
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", token):
            if token not in allowed_date_tokens:
                return False
        if "." in token and token.replace(".", "", 1).isdigit():
            if token not in allowed_numeric_values:
                return False
        if re.search(r"(am|pm|hour|hours|minute|minutes|day|days|week|weeks|month|months)", token):
            if token not in allowed_date_tokens:
                return False
    for topic_id in _topic_id_like_tokens(explanation_lower):
        if topic_id not in plan_topics:
            return False
    return True


def generate_explanation(
    plan: Mapping[str, Any],
    *,
    similar_students: Sequence[Mapping[str, Any]] | None = None,
    llm_explainer: Callable[[Mapping[str, Any]], str] | None = None,
) -> str:
    """Return a template explanation by default, or validate a supplied LLM explanation."""
    if llm_explainer is None:
        return build_template_explanation(plan, similar_students=similar_students)
    explanation = llm_explainer(plan)
    if not validate_explanation(plan, explanation):
        raise ValueError("LLM explanation mentions plan-external topics, times, or numbers.")
    return explanation


def _collect_topic_ids(plan: Mapping[str, Any]) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()

    def walk(node: Any) -> None:
        if isinstance(node, Mapping):
            for key, value in node.items():
                if key in {"topic_id", "topics"} and isinstance(value, str):
                    candidate = value.strip()
                    if candidate and candidate not in seen:
                        found.append(candidate)
                        seen.add(candidate)
                elif key == "topics" and isinstance(value, list):
                    for item in value:
                        if isinstance(item, str):
                            candidate = item.strip()
                            if candidate and candidate not in seen:
                                found.append(candidate)
                                seen.add(candidate)
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(plan)
    return found


def _collect_numeric_values(plan: Mapping[str, Any]) -> set[str]:
    values: set[str] = set()

    def walk(node: Any) -> None:
        if isinstance(node, Mapping):
            for _key, value in node.items():
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    values.add(str(value))
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(plan)
    return values


def _collect_date_tokens(plan: Mapping[str, Any]) -> set[str]:
    tokens: set[str] = set()

    def walk(node: Any) -> None:
        if isinstance(node, Mapping):
            for key, value in node.items():
                keys = {"exam_date", "date", "start_at", "end_at", "scheduled_for"}
                if key in keys and isinstance(value, str):
                    tokens.add(value.lower())
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(plan)
    return tokens


def _extract_value(plan: Mapping[str, Any], key: str) -> str | None:
    if key in plan:
        return str(plan[key])
    for value in plan.values():
        if isinstance(value, Mapping):
            nested = _extract_value(value, key)
            if nested is not None:
                return nested
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, Mapping):
                    nested = _extract_value(item, key)
                    if nested is not None:
                        return nested
    return None


def _topic_id_like_tokens(text: str) -> set[str]:
    tokens: set[str] = set()
    for token in re.findall(r"[A-Za-z0-9_.-]{3,}", text):
        cleaned = token.strip(".:-_")
        if not re.search(r"[A-Za-z]", cleaned):
            continue
        if "." in cleaned or "_" in cleaned or "-" in cleaned:
            tokens.add(cleaned.lower())
    return tokens
