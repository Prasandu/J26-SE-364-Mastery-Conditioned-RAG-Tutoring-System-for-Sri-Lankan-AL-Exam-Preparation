"""Rule-based mark totals for questions and sections.

Used to check that a marking scheme adds up, and by the marking engine to turn
awarded points into question, section and paper totals. The LLM never adds up marks.
"""

from collections.abc import Iterable, Mapping
from typing import Any, Protocol

from app.models import RuleType


class Rule(Protocol):
    @property
    def rule_type(self) -> str: ...

    @property
    def params(self) -> dict[str, Any]: ...


def question_total(awarded: Mapping[str, float], rules: Iterable[Rule]) -> float:
    """Total for one question from the marks awarded per point code.

    - "any_n_of": only the best `n` awarded points of the group count.
    - "max_marks": the total is capped at `max`.
    - "ecf" does not change totals; it changes how a single point is judged.
    """
    counted = dict(awarded)
    cap: float | None = None

    for rule in rules:
        if rule.rule_type == RuleType.ANY_N_OF:
            group = [code for code in rule.params["points"] if code in counted]
            best = sorted(group, key=lambda code: counted[code], reverse=True)[: rule.params["n"]]
            for code in group:
                if code not in best:
                    counted[code] = 0.0
        elif rule.rule_type == RuleType.MAX_MARKS:
            limit = rule.params["max"]
            cap = limit if cap is None else min(cap, limit)

    total = sum(counted.values())
    return total if cap is None else min(total, cap)


def best_of(totals: Iterable[float], choose_count: int | None) -> float:
    """Section total: every question total, or only the best `choose_count` ("answer any N")."""
    ordered = sorted(totals, reverse=True)
    return sum(ordered if choose_count is None else ordered[:choose_count])
