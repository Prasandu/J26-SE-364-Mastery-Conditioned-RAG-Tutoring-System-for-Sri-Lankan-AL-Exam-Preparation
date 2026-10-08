"""Decide marking points with code instead of the AI, where chemistry allows an exact check.

A checker answers one of three ways:
- award it      the answer clearly contains what the marking point asks for
- do not award  the student's attempt was found and it is wrong (e.g. the unit is missing)
- cannot decide (None) the AI judge takes over, so unusual wording is never failed by code

So code never fails a student it simply did not understand, and the marks it does
give are exact and repeatable - unlike an AI, which may answer differently next time.
"""

from dataclasses import dataclass
from typing import Any

from app.models import MarkingPoint, PointType
from app.services.chemistry.graphs import (
    DEFAULT_MIN_R2,
    GraphAnswer,
    best_fit,
    close_enough,
    labels_match,
    plotted_correctly,
    units_match,
)
from app.services.chemistry.graphs import DEFAULT_TOLERANCE_PCT as GRAPH_TOLERANCE_PCT
from app.services.chemistry.notation import normalize
from app.services.chemistry.quantities import Match, compare, parse_quantities, same_unit

CHECKER_NAME = "chemistry-checker"
DEFAULT_TOLERANCE_PCT = 1.0
GRAPH_CHECKS = ("axes", "points", "linear", "gradient", "intercept")


@dataclass(frozen=True)
class StudentAnswer:
    text: str = ""
    graph: GraphAnswer | None = None


@dataclass(frozen=True)
class CheckOutcome:
    awarded: bool
    reason: str
    evidence: str | None = None


def check_point(point: MarkingPoint, answer: StudentAnswer) -> CheckOutcome | None:
    """Decide this marking point by code, or None when only the AI judge can decide."""
    if not point.expected:
        return None

    match point.point_type:
        case PointType.CALCULATION if answer.text.strip():
            return _check_calculation(point.expected, normalize(answer.text))
        case PointType.UNIT if answer.text.strip():
            return _check_unit(point.expected, normalize(answer.text))
        case PointType.GRAPH if answer.graph is not None:
            return _check_graph(point.expected, answer.graph)
        case _:
            return None  # formulas and equations are checked by the AI judge for now


# ---------- Numbers and units ----------


def _check_calculation(expected: dict[str, Any], text: str) -> CheckOutcome | None:
    value = expected.get("value")
    if not isinstance(value, int | float) or isinstance(value, bool):
        return None

    unit = expected.get("unit")
    tolerance = expected.get("tolerance_pct", DEFAULT_TOLERANCE_PCT)
    result, quantity = compare(parse_quantities(text), float(value), unit, float(tolerance))

    match result:
        case Match.EXACT:
            return CheckOutcome(True, "Correct value and unit.", quantity.text)
        case Match.MISSING_UNIT:
            return CheckOutcome(
                False, f"The value is correct but the unit ({unit}) is missing.", quantity.text
            )
        case Match.WRONG_UNIT:
            return CheckOutcome(False, f"The value is correct but the unit should be {unit}.", quantity.text)
        case _:
            return None  # the number is not there in a form code can read: let the AI judge look


def _check_unit(expected: dict[str, Any], text: str) -> CheckOutcome | None:
    unit = expected.get("unit")
    if not isinstance(unit, str):
        return None

    written = next((q for q in parse_quantities(text) if same_unit(q.unit, unit)), None)
    return CheckOutcome(True, f"Correct unit ({unit}).", written.text) if written else None


# ---------- Graphs ----------


def _check_graph(expected: dict[str, Any], graph: GraphAnswer) -> CheckOutcome | None:
    match expected.get("check"):
        case "axes":
            return _check_axes(expected, graph)
        case "points":
            return _check_points(expected, graph)
        case "linear":
            return _check_linear(expected, graph)
        case "gradient":
            return _check_line_value(expected, graph, "gradient")
        case "intercept":
            return _check_line_value(expected, graph, "intercept")
        case _:
            return None


def _check_axes(expected: dict[str, Any], graph: GraphAnswer) -> CheckOutcome | None:
    wanted_x, wanted_y = expected.get("x") or {}, expected.get("y") or {}
    if not wanted_x.get("label") or not wanted_y.get("label"):
        return None

    missing = []
    if not labels_match(graph.x_label, wanted_x["label"]):
        missing.append(f"x axis should be labelled {wanted_x['label']}")
    elif not units_match(graph.x_unit, wanted_x.get("unit")):
        missing.append(f"x axis unit should be {wanted_x['unit']}")
    if not labels_match(graph.y_label, wanted_y["label"]):
        missing.append(f"y axis should be labelled {wanted_y['label']}")
    elif not units_match(graph.y_unit, wanted_y.get("unit")):
        missing.append(f"y axis unit should be {wanted_y['unit']}")

    written = f"x: {_axis(graph.x_label, graph.x_unit)}, y: {_axis(graph.y_label, graph.y_unit)}"
    if missing:
        return CheckOutcome(False, f"Axes: {'; '.join(missing)}.", written)
    return CheckOutcome(True, "Both axes are labelled correctly, with units.", written)


def _check_points(expected: dict[str, Any], graph: GraphAnswer) -> CheckOutcome | None:
    wanted = [(float(x), float(y)) for x, y in expected.get("points") or []]
    if not wanted or not graph.points:
        return None

    tolerance = float(expected.get("tolerance_pct", GRAPH_TOLERANCE_PCT))
    needed = float(expected.get("min_fraction", 1.0)) * len(wanted)
    correct = plotted_correctly(graph, wanted, tolerance)
    evidence = f"{correct} of {len(wanted)} points plotted correctly"

    if correct >= needed:
        return CheckOutcome(True, f"{evidence}.", evidence)
    return CheckOutcome(False, f"Only {evidence}.", evidence)


def _check_linear(expected: dict[str, Any], graph: GraphAnswer) -> CheckOutcome | None:
    fit = best_fit(graph.points)
    if fit is None:
        return None

    min_r2 = float(expected.get("min_r2", DEFAULT_MIN_R2))
    evidence = f"best straight line through the plotted points: r2 = {fit.r2:.3f}"
    if fit.r2 >= min_r2:
        return CheckOutcome(True, f"The points lie on a straight line ({evidence}).", evidence)
    return CheckOutcome(False, f"The points do not lie on a straight line ({evidence}).", evidence)


def _check_line_value(expected: dict[str, Any], graph: GraphAnswer, name: str) -> CheckOutcome | None:
    """Gradient or intercept: correct against the scheme, or against the student's own points (ECF)."""
    wanted = expected.get("value")
    written = getattr(graph, name)
    if not isinstance(wanted, int | float) or not isinstance(written, int | float):
        return None

    tolerance = float(expected.get("tolerance_pct", GRAPH_TOLERANCE_PCT))
    evidence = f"{name} = {written:g}"
    if close_enough(float(written), float(wanted), tolerance):
        return CheckOutcome(True, f"Correct {name}.", evidence)

    fit = best_fit(graph.points) if expected.get("allow_student_points", True) else None
    own = getattr(fit, name) if fit else None
    if own is not None and close_enough(float(written), own, tolerance):
        return CheckOutcome(
            True,
            f"The {name} is read correctly from the student's own points ({own:g}), "
            f"so the mark is carried forward.",
            evidence,
        )
    return CheckOutcome(False, f"The {name} should be about {wanted:g}.", evidence)


def _axis(label: str | None, unit: str | None) -> str:
    return f"{label or '(not labelled)'}{f' ({unit})' if unit else ''}"
