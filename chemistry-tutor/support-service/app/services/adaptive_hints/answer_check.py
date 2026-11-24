import math
import re

from sympy import N, sympify
from sympy.core.sympify import SympifyError

# Matches a leading math-like expression with no internal spaces: digits,
# operators, parentheses, scientific notation (e, E). Used as a fallback for
# answers like "0.5mol" where a unit is glued directly onto the number.
_LEADING_EXPR_RE = re.compile(r"^\s*([\d\.\-\+\*/\^\(\)eE]+)")

# Numeric comparisons use relative tolerance (handles values at any scale,
# e.g. 6.022e23) plus a small absolute floor (handles values near zero,
# where relative tolerance alone would be too strict). Verified answers are
# sometimes rounded (e.g. "72.73" for a repeating decimal) and a student's
# calculator may round slightly differently.
_RELATIVE_TOLERANCE = 1e-6
_ABSOLUTE_TOLERANCE = 1e-2


def _try_sympify(expr_str: str) -> float | None:
    try:
        value = sympify(expr_str)
    except (SympifyError, TypeError, ValueError, SyntaxError):
        return None
    if value.free_symbols:
        return None  # contains an unresolved symbol (e.g. a unit word)
    try:
        return float(N(value))
    except (TypeError, ValueError):
        return None


def _extract_numeric_value(text: str) -> float | None:
    """Parse a numeric value out of a student's answer using SymPy, so
    expressions like '1/2', '2 + 3', or '6.022*10^23' all evaluate
    correctly, not just a bare decimal. Units are a common complication
    (the hint text itself shows "= 0.5 mol"), handled two ways:
    - whitespace-separated unit ("0.5 mol"): strip trailing tokens one at a
      time until the remaining expression parses cleanly
    - unit glued directly onto the number ("0.5mol"): fall back to a
      regex matching only the leading contiguous math-expression characters
    Returns None if nothing numeric can be found at all.
    """
    text = text.strip().rstrip("%").strip()
    if not text:
        return None

    normalized = text.replace("^", "**")

    tokens = normalized.split()
    while tokens:
        value = _try_sympify(" ".join(tokens))
        if value is not None:
            return value
        tokens = tokens[:-1]

    match = _LEADING_EXPR_RE.match(normalized)
    if match:
        return _try_sympify(match.group(1))

    return None


def answers_match(submitted: str, verified: str) -> bool:
    """Numeric comparison (via SymPy, with a small rounding tolerance),
    falling back to case-insensitive string match for non-numeric answers
    like chemical names.
    """
    submitted_value = _extract_numeric_value(submitted)
    verified_value = _extract_numeric_value(verified)

    if submitted_value is not None and verified_value is not None:
        return math.isclose(
            submitted_value,
            verified_value,
            rel_tol=_RELATIVE_TOLERANCE,
            abs_tol=_ABSOLUTE_TOLERANCE,
        )

    return submitted.strip().lower() == verified.strip().lower()
