"""Find numbers with their units in a written answer, and compare them with the marking scheme.

Only units that appear in A/L Chemistry are recognised. That keeps ordinary words
out: in "5 g of NaCl" the quantity is "5 g", and "of NaCl" is just prose.
"""

import re
from dataclasses import dataclass
from enum import StrEnum, auto
from functools import lru_cache

import pint

# Case matters: "M" is mol dm-3, "m" is metre.
UNIT_WORDS = (
    # amount, mass
    "mol", "mmol", "g", "kg", "mg",
    # volume
    "dm", "cm", "mm", "nm", "pm", "m", "L", "l", "mL", "ml",
    # concentration, temperature, energy
    "M", "K", "°C", "J", "kJ", "cal",
    # pressure, time, electricity, other
    "Pa", "kPa", "atm", "bar", "s", "min", "h", "V", "A", "%",
)  # fmt: skip

_WORD = "|".join(re.escape(word) for word in sorted(UNIT_WORDS, key=len, reverse=True))
# An optional exponent written as "^-3", "-3" or "3" (never eating the space before the next unit)
_EXPONENT_PART = r"(?:\s*\^\s*[-+]?\d+|-\d+|\d+)?"
# A unit word with its exponent: mol, dm3, dm-3, dm^-3, mol^-1
_TOKEN = rf"(?:{_WORD})(?![a-zA-Z]){_EXPONENT_PART}"
# Several tokens joined by a space, "/" or "*": "mol dm-3", "kJ/mol", "g*cm-3"
_UNIT = rf"(?<![a-zA-Z]){_TOKEN}(?:(?:\s*[/*]\s*|\s+){_TOKEN})*"
_NUMBER = r"[-+]?\d+(?:\.\d+)?"
# A number on its own, in scientific form (2.00 x 10^-3) or exponent form (2.00e-3)
_VALUE = rf"({_NUMBER})(?:\s*[x*]\s*10\s*\^?\s*([-+]?\d+)|[eE]([-+]?\d+))?"
_QUANTITY = re.compile(rf"{_VALUE}\s*({_UNIT})?")

_EXPONENT = re.compile(r"(?<=[a-zA-Z])\s*\^?\s*(-\d+|\d+)")
_MOLAR = re.compile(r"(?<![a-zA-Z])M(?![a-zA-Z])")


@dataclass(frozen=True)
class Quantity:
    value: float
    unit: str | None
    text: str  # exactly as the student wrote it, for evidence


class Match(StrEnum):
    EXACT = auto()  # value and unit both right
    MISSING_UNIT = auto()  # value right, no unit written
    WRONG_UNIT = auto()  # value right, unit measures something else
    NONE = auto()  # no number close to the expected value


@lru_cache
def _registry() -> pint.UnitRegistry:
    """Building this is slow, so the whole app shares one."""
    return pint.UnitRegistry()


def parse_quantities(text: str) -> list[Quantity]:
    """Every number in the text, with its unit when one follows it."""
    quantities = []
    for match in _QUANTITY.finditer(text):
        number, power_of_ten, exponent, unit = match.groups()
        value = float(number) * 10 ** float(power_of_ten or exponent or 0)
        quantities.append(Quantity(value, _clean_unit(unit), match.group().strip()))
    return quantities


def compare(
    quantities: list[Quantity], expected_value: float, expected_unit: str | None, tolerance_pct: float
) -> tuple[Match, Quantity | None]:
    """How well the best quantity in the answer matches what the marking scheme expects."""
    best = Match.NONE
    best_quantity = None
    for quantity in quantities:
        result = _compare_one(quantity, expected_value, expected_unit, tolerance_pct)
        if result == Match.EXACT:
            return result, quantity
        if best == Match.NONE and result != Match.NONE:
            best, best_quantity = result, quantity
    return best, best_quantity


def same_unit(written: str | None, expected: str) -> bool:
    """True if the two unit spellings measure the same thing (mol/L and mol dm-3 do)."""
    left, right = as_pint(written), as_pint(expected)
    return left is not None and right is not None and left.dimensionality == right.dimensionality


def as_pint(unit: str | None) -> pint.Quantity | None:
    """One unit of `unit`, or None if it cannot be understood."""
    if not unit:
        return None
    try:
        return _registry().Quantity(1.0, _pint_expression(unit))
    except Exception:  # pint raises several different errors for unreadable units
        return None


def _compare_one(
    quantity: Quantity, expected_value: float, expected_unit: str | None, tolerance_pct: float
) -> Match:
    if expected_unit is None:
        return Match.EXACT if _close(quantity.value, expected_value, tolerance_pct) else Match.NONE

    expected = as_pint(expected_unit)
    written = as_pint(quantity.unit)
    if expected is None:  # the marking scheme's own unit is unreadable: compare numbers only
        return Match.EXACT if _close(quantity.value, expected_value, tolerance_pct) else Match.NONE
    if written is None:
        return Match.MISSING_UNIT if _close(quantity.value, expected_value, tolerance_pct) else Match.NONE
    if written.dimensionality != expected.dimensionality:
        return Match.WRONG_UNIT if _close(quantity.value, expected_value, tolerance_pct) else Match.NONE

    # Same kind of unit but a different size (mol dm-3 vs mol m-3): convert before comparing.
    in_expected_unit = quantity.value * written.to(expected.units).magnitude
    return Match.EXACT if _close(in_expected_unit, expected_value, tolerance_pct) else Match.NONE


def _close(value: float, expected: float, tolerance_pct: float) -> bool:
    allowed = abs(expected) * tolerance_pct / 100
    return abs(value - expected) <= allowed


def _clean_unit(unit: str | None) -> str | None:
    return " ".join(unit.split()) if unit else None


def _pint_expression(unit: str) -> str:
    """A/L spelling -> pint spelling: "mol dm-3" -> "mol dm**-3", "M" -> "molar"."""
    expression = unit.replace("°C", "degC")
    expression = _MOLAR.sub("molar", expression)
    return _EXPONENT.sub(r"**\1", expression)
