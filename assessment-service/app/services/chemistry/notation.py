"""Turn A/L Chemistry notation into one plain-text form that code can compare.

Students, marking schemes and AI readers all write the same chemistry differently:

    SO₄²⁻   SO4^2-   \\ce{SO4^{2-}}        ->  SO4^2-
    2.00 × 10⁻³      2.00 x 10^-3         ->  2.00 x 10^-3
    N₂ + 3H₂ ⇌ 2NH₃  N2 + 3H2 <=> 2NH3    ->  N2 + 3H2 <=> 2NH3

Everything downstream (quantities, formulas, equations) works on this form only.
"""

import re

# Superscripts carry meaning (charges, powers), so they keep a "^" marker.
SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻"
_TO_PLAIN_SUPERSCRIPT = str.maketrans(SUPERSCRIPT_DIGITS, "0123456789+-")
# Subscripts are just atom counts, so they become plain digits: H₂O -> H2O.
_TO_PLAIN_SUBSCRIPT = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")

_SUPERSCRIPT_RUN = re.compile(f"[{SUPERSCRIPT_DIGITS}]+")
_CE_WRAPPER = re.compile(r"\\ce\s*\{([^{}]*)\}")  # mhchem: \ce{H2O} -> H2O
_LATEX_SUPERSCRIPT = re.compile(r"\^\s*\{([^{}]*)\}")  # ^{2-} -> ^2-
_LATEX_SUBSCRIPT = re.compile(r"_\s*\{([^{}]*)\}|_(\w)")  # _{2} or _2 -> 2
_SPACED_EXPONENT = re.compile(r"\^\s+")  # "^ 2-" -> "^2-"

REVERSIBLE_ARROW = "<=>"
FORWARD_ARROW = "->"

# One pass over the text, longest spelling first, so "<-->" is not read as "<-" plus "->"
# and a replacement is never scanned again ("<=>" must not become "< ->").
_ARROW_MAP = {
    "<-->": REVERSIBLE_ARROW,
    "<==>": REVERSIBLE_ARROW,
    "<=>": REVERSIBLE_ARROW,
    "<->": REVERSIBLE_ARROW,
    "⇌": REVERSIBLE_ARROW,
    "⇄": REVERSIBLE_ARROW,
    "⇋": REVERSIBLE_ARROW,
    "⟶": FORWARD_ARROW,
    "→": FORWARD_ARROW,
    "⇒": FORWARD_ARROW,
    "-->": FORWARD_ARROW,
    "==>": FORWARD_ARROW,
    "=>": FORWARD_ARROW,
    "->": FORWARD_ARROW,
}
_ARROWS = re.compile("|".join(re.escape(a) for a in sorted(_ARROW_MAP, key=len, reverse=True)))

_CHARACTERS: tuple[tuple[str, str], ...] = (
    ("−", "-"),  # true minus sign
    ("–", "-"),  # en dash
    ("—", "-"),  # em dash
    ("×", " x "),  # multiplication, as in 2.00 × 10^-3
    ("⋅", "*"),  # hydrate dot, as in CuSO4*5H2O
    ("·", "*"),
    ("℃", "°C"),
    ("Δ", "delta"),
    ("⁄", "/"),
)


def normalize(text: str) -> str:
    """One canonical spelling of the same chemistry. Safe to call on any text."""
    result = _CE_WRAPPER.sub(r"\1", text)
    result = _LATEX_SUPERSCRIPT.sub(r"^\1", result)
    result = _LATEX_SUBSCRIPT.sub(lambda m: m.group(1) or m.group(2), result)
    result = result.translate(_TO_PLAIN_SUBSCRIPT)
    result = _SUPERSCRIPT_RUN.sub(lambda m: "^" + m.group().translate(_TO_PLAIN_SUPERSCRIPT), result)

    for old, new in _CHARACTERS:
        result = result.replace(old, new)
    result = _ARROWS.sub(lambda m: f" {_ARROW_MAP[m.group()]} ", result)

    result = _SPACED_EXPONENT.sub("^", result)
    return " ".join(result.split())
