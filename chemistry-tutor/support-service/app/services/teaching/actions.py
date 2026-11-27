"""TUT-014: the structured teaching response and its server-side validator.

A teaching response (from the RAG generator or a deterministic worked example) is only
*proposed* content. Before anything reaches the whiteboard or the avatar's script:

- the shape must match exactly (unknown fields refused);
- visual actions come from a finite vocabulary; anything else is dropped - never
  executed - and every action must point at an existing verified step;
- every calculation step is recomputed here by a small arithmetic evaluator (numbers,
  + - * / **, parentheses and earlier steps' variables - no names, calls or attributes,
  no eval), and the displayed number must be the correct rounding of the recomputed
  value; units are checked whenever the formula is built from earlier quantities;
- citations must be sources that retrieval actually returned;
- no text may carry a URL, markup or script.

A wrong number, an invented citation or unsafe text rejects the whole response: the
student then gets plain-text guidance instead of a confident wrong whiteboard. The
validator never changes marks, lab state or any stored data.
"""

from __future__ import annotations

import ast
import math
import re
from collections import Counter
from decimal import Decimal, InvalidOperation
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.services.teaching.chemistry import FormulaError, check_balanced

MAX_STEPS = 20
MAX_ACTIONS = 40
MAX_FORMULA_CHARS = 120
MAX_EXPONENT = 10
UNSAFE_TEXT = re.compile(r"(https?://|www\.|javascript:|data:|<\s*/?\s*[a-z!])", re.IGNORECASE)
IDENTIFIER = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,15}$")
RESULT = re.compile(r"^\s*([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*(.*?)\s*$")
StepId = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_-]{0,15}$")]
SafeText = Annotated[str, Field(max_length=300)]


class Citation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: Annotated[str, Field(min_length=1, max_length=120)]
    page: Annotated[int, Field(ge=1, le=5000)] | None = None


class VerifiedStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: StepId
    kind: Literal["given", "unit_conversion", "calculation"]
    label: SafeText = ""
    formula: Annotated[str, Field(min_length=3, max_length=MAX_FORMULA_CHARS)]  # "n = 26.5 / 106"
    result: Annotated[str, Field(min_length=1, max_length=40)]  # "0.250 mol"


class StepAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["writeEquation", "highlightStep", "showFormula"]
    step_id: StepId


class HighlightTerm(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["highlightTerm"]
    step_id: StepId
    term: Annotated[str, Field(min_length=1, max_length=20)]


class PlotPoints(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["plotPoints"]
    points: Annotated[list[tuple[float, float]], Field(min_length=1, max_length=50)]
    x_label: SafeText
    y_label: SafeText


class Pause(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["pause"]
    seconds: Annotated[float, Field(ge=0.5, le=10)]


VisualAction = Annotated[StepAction | HighlightTerm | PlotPoints | Pause, Field(discriminator="type")]
ALLOWED_ACTION_TYPES = {
    "writeEquation",
    "highlightStep",
    "showFormula",
    "highlightTerm",
    "plotPoints",
    "pause",
}


class TextBlock(BaseModel):
    """A short explanation paragraph - plain text only (rendered as text, never HTML)."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["text"]
    text: Annotated[str, Field(min_length=1, max_length=800)]


class TableBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["table"]
    caption: Annotated[str, Field(max_length=120)] = ""
    headers: Annotated[list[Annotated[str, Field(max_length=60)]], Field(min_length=1, max_length=6)]
    rows: Annotated[list[list[Annotated[str, Field(max_length=80)]]], Field(min_length=1, max_length=12)]


class EquationTerm(BaseModel):
    model_config = ConfigDict(extra="forbid")

    coefficient: Annotated[int, Field(ge=1, le=99)] = 1
    formula: Annotated[str, Field(min_length=1, max_length=40)]  # "Na2CO3", "SO4^2-", "H2O(l)"


class ChemEquationBlock(BaseModel):
    """Shown only if both sides balance in atoms and charge (app/services/teaching/chemistry.py)."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["chem_equation"]
    reactants: Annotated[list[EquationTerm], Field(min_length=1, max_length=8)]
    products: Annotated[list[EquationTerm], Field(min_length=1, max_length=8)]
    arrow: Literal["->", "<=>"] = "->"


Block = Annotated[TextBlock | TableBlock | ChemEquationBlock, Field(discriminator="type")]
SCHEMA_VERSIONS = ("1.0", "1.1")


class TeachingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # 1.0: steps + actions; 1.1 adds text, table and chemical-equation blocks.
    schema_version: Literal["1.0", "1.1"] = "1.1"
    response_id: Annotated[str, Field(min_length=1, max_length=64)]
    language: Literal["en", "si"]
    spoken_text: Annotated[str, Field(max_length=1500)]
    citations: Annotated[list[Citation], Field(max_length=8)] = Field(default_factory=list)
    verified_steps: Annotated[list[VerifiedStep], Field(max_length=MAX_STEPS)] = Field(default_factory=list)
    visual_actions: Annotated[list[VisualAction], Field(max_length=MAX_ACTIONS)] = Field(default_factory=list)
    learning_mode: Literal["worked_example", "socratic", "quick_explanation"]
    blocks: Annotated[list[Block], Field(max_length=12)] = Field(default_factory=list)
    # Always true: an explanation, never a mark (the tutor cannot touch assessment records).
    ai_generated: Literal[True] = True


class StepCheck(BaseModel):
    step_id: str
    computed: float | None
    unit_checked: bool


class ValidatedTeaching(BaseModel):
    """verified: everything checked; partially_verified: numbers checked but some actions
    were dropped or some units could not be derived; rejected: show plain text only."""

    status: Literal["verified", "partially_verified", "rejected"]
    response: TeachingResponse | None
    checks: list[StepCheck] = Field(default_factory=list)
    problems: list[str] = Field(default_factory=list)


class TeachingRejected(ValueError):
    pass


def validate_teaching_response(
    raw: object,
    *,
    allowed_source_ids: set[str],
) -> ValidatedTeaching:
    """Check a proposed teaching response; never raises for bad input."""
    if not isinstance(raw, dict):
        return _rejected(["response is not an object"])
    problems: list[str] = []
    actions_in = raw.get("visual_actions")
    kept_actions = []
    if isinstance(actions_in, list):
        for index, action in enumerate(actions_in):
            if isinstance(action, dict) and action.get("type") in ALLOWED_ACTION_TYPES:
                kept_actions.append(action)
            else:
                kind = action.get("type") if isinstance(action, dict) else type(action).__name__
                problems.append(f"action #{index} ({kind!r}) is not in the allowed vocabulary; dropped")
    try:
        response = TeachingResponse.model_validate({**raw, "visual_actions": kept_actions})
    except ValidationError as exc:
        first = exc.errors()[0]
        where = ".".join(str(part) for part in first.get("loc", ())) or "response"
        return _rejected([*problems, f"invalid response at {where}: {first.get('msg')}"])

    try:
        _check_text(response)
        _check_citations(response, allowed_source_ids)
        checks = _check_steps(response.verified_steps)
        _check_blocks(response.blocks)
    except TeachingRejected as exc:
        return _rejected([*problems, str(exc)])

    step_ids = {step.id for step in response.verified_steps}
    formulas = {step.id: step.formula for step in response.verified_steps}
    valid_actions = []
    for index, action in enumerate(response.visual_actions):
        step_id = getattr(action, "step_id", None)
        if step_id is not None and step_id not in step_ids:
            problems.append(f"action #{index} points at unknown step {step_id!r}; dropped")
        elif isinstance(action, HighlightTerm) and action.term not in formulas[action.step_id]:
            problems.append(f"action #{index} highlights a term not in step {action.step_id!r}; dropped")
        else:
            valid_actions.append(action)
    response = response.model_copy(update={"visual_actions": valid_actions})
    unchecked_units = [check.step_id for check in checks if not check.unit_checked]
    if unchecked_units:
        problems.append("units not derivable for steps " + ", ".join(unchecked_units) + " (numbers checked)")
    status = "verified" if not problems else "partially_verified"
    return ValidatedTeaching(status=status, response=response, checks=checks, problems=problems)


def _rejected(problems: list[str]) -> ValidatedTeaching:
    return ValidatedTeaching(status="rejected", response=None, problems=problems)


def _check_text(response: TeachingResponse) -> None:
    texts = [response.spoken_text]
    for step in response.verified_steps:
        texts += [step.label, step.formula, step.result]
    for block in response.blocks:
        if isinstance(block, TextBlock):
            texts.append(block.text)
        elif isinstance(block, TableBlock):
            texts += [block.caption, *block.headers, *(cell for row in block.rows for cell in row)]
        else:
            texts += [term.formula for term in (*block.reactants, *block.products)]
    for action in response.visual_actions:
        if isinstance(action, PlotPoints):
            texts += [action.x_label, action.y_label]
        if isinstance(action, HighlightTerm):
            texts.append(action.term)
    for text in texts:
        if UNSAFE_TEXT.search(text):
            raise TeachingRejected("text contains a URL, markup or script")


def _check_blocks(blocks: list) -> None:
    for index, block in enumerate(blocks):
        if isinstance(block, TableBlock):
            if any(len(row) != len(block.headers) for row in block.rows):
                raise TeachingRejected(f"table #{index}: every row needs one cell per header")
        elif isinstance(block, ChemEquationBlock):
            try:
                check_balanced(
                    [(t.coefficient, t.formula) for t in block.reactants],
                    [(t.coefficient, t.formula) for t in block.products],
                )
            except FormulaError as exc:
                raise TeachingRejected(f"equation #{index}: {exc}") from exc


def _check_citations(response: TeachingResponse, allowed: set[str]) -> None:
    invented = sorted({c.source_id for c in response.citations} - allowed)
    if invented:
        raise TeachingRejected("citation not among the retrieved sources: " + ", ".join(invented))


def _check_steps(steps: list[VerifiedStep]) -> list[StepCheck]:
    ids = Counter(step.id for step in steps)
    duplicated = [step_id for step_id, count in ids.items() if count > 1]
    if duplicated:
        raise TeachingRejected("duplicate step ids: " + ", ".join(duplicated))
    values: dict[str, float] = {}
    units: dict[str, Counter] = {}
    checks = []
    for step in steps:
        name, expression = _split_formula(step.formula, step.id)
        if name in values:
            raise TeachingRejected(f"step {step.id}: {name} is defined twice")
        shown, unit_text = _parse_result(step.result, step.id)
        tree = _parse_expression(expression, step.id)
        computed = _evaluate(tree, values, step.id)
        if not _matches_display(shown, computed):
            raise TeachingRejected(f"step {step.id}: shows {shown} but the formula gives {computed:.6g}")
        result_unit = parse_unit(unit_text, step.id)
        unit_checked = False
        if step.kind == "unit_conversion":
            unit_checked = _check_conversion(tree, units, result_unit, step.id)
        elif _uses_names(tree):
            derived = _unit_of(tree, units, step.id)
            if derived is not None:
                if derived != result_unit:
                    raise TeachingRejected(
                        f"step {step.id}: unit {unit_text or 'none'!r} does not follow from the formula"
                    )
                unit_checked = True
        values[name] = computed
        units[name] = result_unit
        checks.append(
            StepCheck(step_id=step.id, computed=computed, unit_checked=unit_checked or step.kind == "given")
        )
    return checks


def _split_formula(formula: str, step_id: str) -> tuple[str, str]:
    if formula.count("=") != 1:
        raise TeachingRejected(f"step {step_id}: formula must be 'name = expression'")
    name, expression = (part.strip() for part in formula.split("="))
    if not IDENTIFIER.match(name):
        raise TeachingRejected(f"step {step_id}: {name!r} is not a plain variable name")
    return name, expression


def _parse_result(result: str, step_id: str) -> tuple[Decimal, str]:
    match = RESULT.match(result)
    if match is None:
        raise TeachingRejected(f"step {step_id}: result must start with a number")
    try:
        return Decimal(match.group(1)), match.group(2)
    except InvalidOperation as exc:
        raise TeachingRejected(f"step {step_id}: result is not a number") from exc


def _parse_expression(expression: str, step_id: str) -> ast.AST:
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise TeachingRejected(f"step {step_id}: formula is not arithmetic") from exc
    for node in ast.walk(tree):
        if not isinstance(
            node,
            (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.Name, ast.Load)
            + (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.USub, ast.UAdd),
        ):
            raise TeachingRejected(f"step {step_id}: {type(node).__name__} is not allowed in a formula")
        if isinstance(node, ast.Constant) and (
            isinstance(node.value, bool) or not isinstance(node.value, int | float)
        ):
            raise TeachingRejected(f"step {step_id}: only numbers are allowed as constants")
    return tree


def _evaluate(node: ast.AST, values: dict[str, float], step_id: str) -> float:
    if isinstance(node, ast.Expression):
        return _evaluate(node.body, values, step_id)
    if isinstance(node, ast.Constant):
        return float(node.value)
    if isinstance(node, ast.Name):
        if node.id not in values:
            raise TeachingRejected(f"step {step_id}: {node.id} is not defined by an earlier step")
        return values[node.id]
    if isinstance(node, ast.UnaryOp):
        operand = _evaluate(node.operand, values, step_id)
        return -operand if isinstance(node.op, ast.USub) else operand
    if isinstance(node, ast.BinOp):
        left, right = _evaluate(node.left, values, step_id), _evaluate(node.right, values, step_id)
        if isinstance(node.op, ast.Pow):
            if abs(right) > MAX_EXPONENT:
                raise TeachingRejected(f"step {step_id}: exponent too large")
            result = left**right
        elif isinstance(node.op, ast.Div):
            if right == 0:
                raise TeachingRejected(f"step {step_id}: division by zero")
            result = left / right
        elif isinstance(node.op, ast.Mult):
            result = left * right
        elif isinstance(node.op, ast.Add):
            result = left + right
        else:
            result = left - right
        if isinstance(result, complex) or not math.isfinite(result):
            raise TeachingRejected(f"step {step_id}: result is not a finite number")
        return float(result)
    raise TeachingRejected(f"step {step_id}: unsupported expression")


def _matches_display(shown: Decimal, computed: float) -> bool:
    """The displayed value must be the computed value rounded to the digits shown."""
    exponent = shown.as_tuple().exponent
    half_unit = Decimal(1).scaleb(exponent if isinstance(exponent, int) else 0) / 2
    return abs(Decimal(repr(computed)) - shown) <= half_unit + Decimal("1e-12")


def _uses_names(tree: ast.AST) -> bool:
    return any(isinstance(node, ast.Name) for node in ast.walk(tree))


# --- units: a small algebra over the units A/L Chemistry calculations use ----------------

UNIT_SYMBOLS = {"g", "kg", "mg", "mol", "dm3", "cm3", "m3", "K", "Pa", "kPa", "J", "kJ", "s", "min"}
ALIASES = {"L": "dm3", "l": "dm3", "mL": "cm3", "ml": "cm3"}
VOLUME_BASES = {"dm", "cm", "m"}
TOKEN = re.compile(r"^([A-Za-z]+?)(-?\d+)?$")


def parse_unit(text: str, step_id: str = "?") -> Counter:
    """'mol dm-3', 'mol/dm3', 'g mol-1', 'mol L-1' -> {symbol: exponent}. '' -> dimensionless."""
    unit: Counter = Counter()
    if not text:
        return unit
    numerator, _, denominator = text.replace("·", " ").replace("^", "").partition("/")
    for part, sign in ((numerator, 1), (denominator, -1)):
        for token in part.split():
            symbol, power = _token(token, step_id)
            unit[symbol] += sign * power
    return Counter({symbol: power for symbol, power in unit.items() if power})


def _token(token: str, step_id: str) -> tuple[str, int]:
    if token in UNIT_SYMBOLS:
        return token, 1
    if token in ALIASES:
        return ALIASES[token], 1
    match = TOKEN.match(token)
    if match is None:
        raise TeachingRejected(f"step {step_id}: unknown unit {token!r}")
    base, exponent = match.group(1), int(match.group(2) or 1)
    if base in VOLUME_BASES and abs(exponent) == 3:  # dm-3 = per cubic decimetre
        return f"{base}3", exponent // 3
    base = ALIASES.get(base, base)
    if base not in UNIT_SYMBOLS:
        raise TeachingRejected(f"step {step_id}: unknown unit {token!r}")
    return base, exponent


# Exact conversions only: (from, to) -> (operator, factor).
CONVERSIONS = {
    ("cm3", "dm3"): (ast.Div, 1000),
    ("dm3", "cm3"): (ast.Mult, 1000),
    ("dm3", "m3"): (ast.Div, 1000),
    ("m3", "dm3"): (ast.Mult, 1000),
    ("mg", "g"): (ast.Div, 1000),
    ("g", "mg"): (ast.Mult, 1000),
    ("g", "kg"): (ast.Div, 1000),
    ("kg", "g"): (ast.Mult, 1000),
    ("Pa", "kPa"): (ast.Div, 1000),
    ("kPa", "Pa"): (ast.Mult, 1000),
    ("J", "kJ"): (ast.Div, 1000),
    ("kJ", "J"): (ast.Mult, 1000),
    ("min", "s"): (ast.Mult, 60),
}


def _check_conversion(tree: ast.AST, units: dict[str, Counter], target: Counter, step_id: str) -> bool:
    """A unit_conversion step must be `earlier_quantity / factor` or `* factor` with the
    exact factor between its unit and the result unit."""
    body = tree.body if isinstance(tree, ast.Expression) else tree
    if not (
        isinstance(body, ast.BinOp)
        and isinstance(body.left, ast.Name)
        and isinstance(body.right, ast.Constant)
        and isinstance(body.op, ast.Div | ast.Mult)
    ):
        raise TeachingRejected(
            f"step {step_id}: a unit conversion must be 'name / factor' or 'name * factor'"
        )
    source = units[body.left.id]
    single = [(symbol, power) for symbol, power in source.items()]
    wanted = [(symbol, power) for symbol, power in target.items()]
    if len(single) != 1 or len(wanted) != 1 or single[0][1] != 1 or wanted[0][1] != 1:
        raise TeachingRejected(f"step {step_id}: only single-unit conversions are supported")
    rule = CONVERSIONS.get((single[0][0], wanted[0][0]))
    if rule is None or not isinstance(body.op, rule[0]) or float(body.right.value) != rule[1]:
        raise TeachingRejected(f"step {step_id}: {single[0][0]} -> {wanted[0][0]} is not that conversion")
    return True


def _unit_of(node: ast.AST, units: dict[str, Counter], step_id: str) -> Counter | None:
    """Unit of an expression of earlier quantities; None when it cannot be derived."""
    if isinstance(node, ast.Expression):
        return _unit_of(node.body, units, step_id)
    if isinstance(node, ast.Constant):
        return Counter()
    if isinstance(node, ast.Name):
        return Counter(units[node.id])
    if isinstance(node, ast.UnaryOp):
        return _unit_of(node.operand, units, step_id)
    if isinstance(node, ast.BinOp):
        left, right = _unit_of(node.left, units, step_id), _unit_of(node.right, units, step_id)
        if left is None or right is None:
            return None
        if isinstance(node.op, ast.Add | ast.Sub):
            if left != right:
                raise TeachingRejected(f"step {step_id}: adds or subtracts different units")
            return left
        if isinstance(node.op, ast.Pow):
            if (
                right
                or not isinstance(node.right, ast.Constant)
                or float(node.right.value) != int(node.right.value)
            ):
                return None
            return Counter({symbol: power * int(node.right.value) for symbol, power in left.items()})
        combined = Counter(left)
        for symbol, power in right.items():
            combined[symbol] += power if isinstance(node.op, ast.Mult) else -power
        return Counter({symbol: power for symbol, power in combined.items() if power})
    return None
