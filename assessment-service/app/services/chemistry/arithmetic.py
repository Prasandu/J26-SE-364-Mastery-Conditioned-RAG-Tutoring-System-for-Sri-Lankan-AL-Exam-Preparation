"""Work the number out again, independently of whatever claimed it.

Two jobs, kept apart because they answer different questions:

- `evaluate` recomputes a line of working ("0.0200 * 0.100") with Decimal, so the
  answer a marking scheme states can be checked against the arithmetic that is
  supposed to produce it. Decimal, not float, because 0.1 + 0.2 is not 0.3 and a
  marking scheme is written in decimal digits.
- `equivalent` asks SymPy whether two expressions are the same expression written
  differently ("c*V" and "V*c"), which is the one thing a symbolic library is
  actually reliable for here.

What is supported:

    + - * / ** and brackets          0.0200 * 0.100 / 2
    scientific notation              2.00 x 10^-3, 2.00e-3, 10^-14
    percentages of a number          nothing: write 0.15, not 15%
    single-letter symbols            c*V, n/V  (equivalent only)
    square roots                     sqrt(1.0e-14)

What is NOT supported, and returns None rather than a guess:

    units                            "0.1 mol dm-3" - strip the unit first, or use
                                     quantities.py, which understands units
    chemistry                        equilibrium, pH of a buffer, oxidation states;
                                     this module does arithmetic, nothing else
    functions other than sqrt/log/exp/ln
    anything with a name longer than one letter, so no attribute access and no calls

Nothing from a model is handed to a Python evaluator. The text must match a strict
pattern first, and parsing runs with an empty namespace.
"""

import re
from decimal import Decimal, DecimalException, getcontext, localcontext

import sympy
from sympy.parsing.sympy_parser import parse_expr

from app.services.chemistry.notation import normalize

# A/L answers are quoted to three or four significant figures. Fifty digits of working
# precision is far more than enough and keeps the rounding out of the comparison.
WORKING_DIGITS = 50
DEFAULT_TOLERANCE_PCT = 1.0

FUNCTIONS = ("sqrt", "log", "ln", "exp")

# Only these characters may appear. Letters are allowed one at a time (a symbol) or as
# one of the named functions, which is enough to stop any attribute or call expression.
_NAMED_FUNCTION = r"(?<![A-Za-z])(?:" + "|".join(FUNCTIONS) + r")(?![A-Za-z])"
_LONE_LETTER = r"(?<![A-Za-z])[a-zA-Z](?![A-Za-z])"
_SAFE = re.compile(r"^(?:[0-9.+\-*/()^,eE\s]|" + _NAMED_FUNCTION + "|" + _LONE_LETTER + r")+$")
_SCIENTIFIC = re.compile(r"(?<=[\d.)\s])\s*[x*]\s*10\s*\^?\s*([-+]?\d+)")
_BARE_POWER_OF_TEN = re.compile(r"(?<![\d.])10\s*\^\s*([-+]?\d+)")
_CARET = re.compile(r"\^")

# Everything SymPy, Decimal and eval throw at us for text that is not an expression.
# None of them mean "the answer is wrong"; they all mean "this is not supported".
_PARSE_FAILURES = (
    SyntaxError,
    TypeError,
    ValueError,
    AttributeError,
    NameError,
    KeyError,
    RecursionError,
    ZeroDivisionError,
    OverflowError,
    DecimalException,
    sympy.SympifyError,
)


def evaluate(expression: str) -> Decimal | None:
    """The value of a line of working, or None when it cannot be worked out safely.

    None means "this module does not support that", never "the answer is wrong".
    """
    prepared = _prepare(expression)
    if prepared is None:
        return None
    try:
        with localcontext() as context:
            context.prec = WORKING_DIGITS
            parsed = parse_expr(prepared, local_dict={}, global_dict=_namespace(), evaluate=True)
            if parsed.free_symbols or not parsed.is_number:
                return None
            return _to_decimal(parsed)
    except _PARSE_FAILURES:
        return None


def agrees(expression: str, claimed: float, tolerance_pct: float = DEFAULT_TOLERANCE_PCT) -> bool | None:
    """Does the working come out at the value the scheme claims?

    None when the working cannot be evaluated, so an unsupported format is never
    reported as a mistake.
    """
    computed = evaluate(expression)
    if computed is None:
        return None
    allowed = abs(Decimal(str(claimed))) * Decimal(str(tolerance_pct)) / Decimal(100)
    return abs(computed - Decimal(str(claimed))) <= allowed


def equivalent(left: str, right: str) -> bool | None:
    """Are these the same expression written two ways? None when either cannot be read."""
    first, second = _prepare(left), _prepare(right)
    if first is None or second is None:
        return None
    try:
        difference = sympy.simplify(
            parse_expr(first, local_dict={}, global_dict=_namespace(), evaluate=True)
            - parse_expr(second, local_dict={}, global_dict=_namespace(), evaluate=True)
        )
    except _PARSE_FAILURES:
        return None
    return bool(difference == 0)


def significant_figures(text: str) -> int | None:
    """How many significant figures a written number is quoted to.

    Used to notice a model answer quoted to one figure where the scheme asks for three.
    Trailing zeros before the decimal point are ambiguous in ordinary notation, so
    "100" returns None rather than a number nobody can defend.
    """
    cleaned = re.sub(r"\s", "", text)
    found = re.match(r"^[-+]?(\d*\.?\d+)", cleaned)
    if not found:
        return None
    digits = found.group(1)
    if "." not in digits:
        stripped = digits.strip("0")
        if digits.endswith("0") and stripped:
            return None  # "100" could be 1, 2 or 3 figures
        return len(stripped) or 1
    whole, _, fraction = digits.partition(".")
    if whole.strip("0"):
        return len((whole + fraction).lstrip("0"))
    return len(fraction.lstrip("0")) or 1


def _namespace() -> dict[str, object]:
    """The only names the expression is evaluated against.

    SymPy's parser rewrites "2" as Integer('2') and "x" as Symbol('x'), so those
    constructors have to be reachable. Nothing else is: no builtins, no imports, no
    attribute access, which is why the pattern above allows only single letters.
    """
    return {
        "Integer": sympy.Integer,
        "Float": sympy.Float,
        "Rational": sympy.Rational,
        "Symbol": sympy.Symbol,
        "sqrt": sympy.sqrt,
        "log": sympy.log,
        "ln": sympy.log,
        "exp": sympy.exp,
        "E": sympy.E,
    }


def _prepare(expression: str) -> str | None:
    """A/L notation into something SymPy reads, or None when it is not safe to parse."""
    # Normalised here, not at the call site: working comes straight from a model and
    # arrives as "2.00 x 10^-3" or "2.00 × 10⁻³" with equal likelihood.
    text = normalize(expression).strip()
    if not text or len(text) > 500:
        return None
    # "2.00 x 10^-3" and "10^-14" are powers of ten, not a symbol x times something.
    text = _SCIENTIFIC.sub(r"*10**(\1)", text)
    text = _BARE_POWER_OF_TEN.sub(r"10**(\1)", text)
    text = _CARET.sub("**", text)
    return text if _SAFE.match(text) else None


def _to_decimal(value: sympy.Expr) -> Decimal | None:
    """A SymPy number as a Decimal, exactly where it is rational."""
    rational = sympy.nsimplify(value, rational=True)
    if rational.is_Rational:
        numerator, denominator = rational.as_numer_denom()
        return Decimal(int(numerator)) / Decimal(int(denominator))
    as_float = value.evalf(getcontext().prec)
    return Decimal(str(as_float)) if as_float.is_number else None
