"""Deterministic checks for chemical equations on the tutor whiteboard (TUT-014).

A generated equation is shown only if every formula parses into real element symbols and
both sides balance - atoms of every element and total charge. This checks bookkeeping,
not chemistry: a balanced equation can still describe a reaction that does not happen,
which is why the whiteboard also needs cited sources. No model is involved here.
"""

from __future__ import annotations

import re
from collections import Counter

ELEMENTS = frozenset(
    """H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As
    Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd
    Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am
    Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og""".split()
)
# A charge is "+"/"-" or, for more than one, caret notation: "Na+", "SO4^2-", "Fe^3+".
CHARGE = re.compile(r"(?:\^(\d*))?([+-])$")
STATE = re.compile(r"\((s|l|g|aq)\)$")
TOKEN = re.compile(r"([A-Z][a-z]?)|(\d+)|([()\[\]])|([·.*])")
MAX_FORMULA = 40


class FormulaError(ValueError):
    pass


def parse_formula(formula: str) -> tuple[Counter, int]:
    """'Ca(OH)2' -> ({Ca:1, O:2, H:2}, 0); 'SO4^2-' -> ({S:1, O:4}, -2); 'CuSO4·5H2O' too."""
    text = formula.strip().replace(" ", "")
    if not text or len(text) > MAX_FORMULA:
        raise FormulaError(f"formula {formula!r} is empty or too long")
    text = STATE.sub("", text)
    charge = 0
    if match := CHARGE.search(text):
        if text.endswith(("+", "-")):
            magnitude = int(match.group(1) or 1)
            charge = magnitude if match.group(2) == "+" else -magnitude
            text = text[: match.start()]
    parts = re.split(r"[·.*]", text)
    total: Counter = Counter()
    for part in parts:
        multiplier = 1
        if lead := re.match(r"^(\d+)", part):
            multiplier, part = int(lead.group(1)), part[lead.end() :]
        total.update({element: count * multiplier for element, count in _group(part).items()})
    if not total:
        raise FormulaError(f"formula {formula!r} has no elements")
    return total, charge


def _group(text: str) -> Counter:
    stack: list[Counter] = [Counter()]
    position = 0
    while position < len(text):
        match = TOKEN.match(text, position)
        if not match:
            raise FormulaError(f"cannot read {text[position:]!r}")
        symbol, number, bracket, _dot = match.groups()
        position = match.end()
        count_match = re.match(r"\d+", text[position:])
        count = int(count_match.group()) if count_match else 1
        if symbol:
            if symbol not in ELEMENTS:
                raise FormulaError(f"{symbol!r} is not an element symbol")
            position += len(count_match.group()) if count_match else 0
            stack[-1][symbol] += count
        elif bracket in "([":
            stack.append(Counter())
        elif bracket in ")]":
            if len(stack) == 1:
                raise FormulaError("unbalanced brackets")
            position += len(count_match.group()) if count_match else 0
            inner = stack.pop()
            stack[-1].update({element: n * count for element, n in inner.items()})
        elif number:
            raise FormulaError("a number must follow an element or a bracket")
    if len(stack) != 1:
        raise FormulaError("unbalanced brackets")
    return stack[0]


def side_totals(terms: list[tuple[int, str]]) -> tuple[Counter, int]:
    atoms: Counter = Counter()
    charge = 0
    for coefficient, formula in terms:
        counts, ion_charge = parse_formula(formula)
        atoms.update({element: n * coefficient for element, n in counts.items()})
        charge += ion_charge * coefficient
    return atoms, charge


def check_balanced(reactants: list[tuple[int, str]], products: list[tuple[int, str]]) -> None:
    """Raise FormulaError unless atoms of every element and total charge balance."""
    left_atoms, left_charge = side_totals(reactants)
    right_atoms, right_charge = side_totals(products)
    if left_atoms != right_atoms:
        differing = sorted(set(left_atoms) | set(right_atoms))
        detail = ", ".join(
            f"{e} {left_atoms.get(e, 0)}≠{right_atoms.get(e, 0)}"
            for e in differing
            if left_atoms.get(e, 0) != right_atoms.get(e, 0)
        )
        raise FormulaError(f"atoms do not balance ({detail})")
    if left_charge != right_charge:
        raise FormulaError(f"charge does not balance ({left_charge} vs {right_charge})")
