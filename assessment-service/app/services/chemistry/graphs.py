"""Mark a graph from the student's own data instead of from a picture of it.

In digital mode the student plots points with a tool, so the system holds the real
numbers: the points, the axis labels and the gradient they read off. Code can then
check all of it exactly, including error carried forward - a gradient read correctly
from the student's own (slightly wrong) points still earns its mark.
"""

import math
from dataclasses import dataclass
from typing import Any

from app.services.chemistry.quantities import same_unit

DEFAULT_TOLERANCE_PCT = 5.0
# A gently curved set of points can still reach r2 = 0.97, so "a straight line" needs a high bar.
DEFAULT_MIN_R2 = 0.99


@dataclass(frozen=True)
class BestFit:
    gradient: float
    intercept: float
    r2: float  # 1.0 = the points lie exactly on a straight line


@dataclass(frozen=True)
class GraphAnswer:
    """What the student plotted. Any part may be missing."""

    points: list[tuple[float, float]]
    x_label: str | None = None
    x_unit: str | None = None
    y_label: str | None = None
    y_unit: str | None = None
    gradient: float | None = None
    intercept: float | None = None

    @classmethod
    def from_data(cls, data: dict[str, Any] | None) -> "GraphAnswer | None":
        if not data:
            return None
        points = [(float(x), float(y)) for x, y in data.get("points") or []]
        return cls(
            points=points,
            x_label=data.get("x_label"),
            x_unit=data.get("x_unit"),
            y_label=data.get("y_label"),
            y_unit=data.get("y_unit"),
            gradient=data.get("gradient"),
            intercept=data.get("intercept"),
        )


def best_fit(points: list[tuple[float, float]]) -> BestFit | None:
    """Least-squares straight line through the points, or None if one cannot be drawn."""
    count = len(points)
    if count < 2:
        return None

    sum_x = sum(x for x, _ in points)
    sum_y = sum(y for _, y in points)
    sum_xx = sum(x * x for x, _ in points)
    sum_xy = sum(x * y for x, y in points)

    spread = count * sum_xx - sum_x * sum_x
    if math.isclose(spread, 0.0):  # every point has the same x, so there is no gradient
        return None

    gradient = (count * sum_xy - sum_x * sum_y) / spread
    intercept = (sum_y - gradient * sum_x) / count
    return BestFit(gradient, intercept, _r_squared(points, gradient, intercept))


def close_enough(value: float, expected: float, tolerance_pct: float) -> bool:
    """Within a percentage of the expected value; near zero, allow the same absolute gap."""
    allowed = abs(expected) * tolerance_pct / 100 or tolerance_pct / 100
    return abs(value - expected) <= allowed


def labels_match(written: str | None, expected: str) -> bool:
    return bool(written) and _tidy(written) == _tidy(expected)


def units_match(written: str | None, expected: str | None) -> bool:
    if not expected:
        return True  # the marking scheme does not ask for a unit on this axis
    return same_unit(written, expected)


def plotted_correctly(
    answer: GraphAnswer, expected_points: list[tuple[float, float]], tolerance_pct: float
) -> int:
    """How many of the expected points the student plotted (in any order)."""
    return sum(
        any(
            close_enough(x, expected_x, tolerance_pct) and close_enough(y, expected_y, tolerance_pct)
            for x, y in answer.points
        )
        for expected_x, expected_y in expected_points
    )


def _r_squared(points: list[tuple[float, float]], gradient: float, intercept: float) -> float:
    mean_y = sum(y for _, y in points) / len(points)
    total = sum((y - mean_y) ** 2 for _, y in points)
    unexplained = sum((y - (gradient * x + intercept)) ** 2 for x, y in points)
    return 1.0 if math.isclose(total, 0.0) else 1 - unexplained / total


def _tidy(label: str) -> str:
    return " ".join(label.lower().split())
