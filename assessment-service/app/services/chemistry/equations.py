"""Does a chemical equation have the same atoms on both sides?

This is arithmetic, not chemistry. The checker counts the atoms of each element and
the total charge on each side, and reports where they differ. It says nothing about
whether the reaction is real, whether those products would actually form, or whether
the conditions make sense.

What it reads:

    2H2 + O2 -> 2H2O                      coefficients, simple formulas
    N2 + 3H2 <=> 2NH3                     reversible arrows
    Ca(OH)2 + 2HCl -> CaCl2 + 2H2O        bracketed groups
    CuSO4*5H2O -> CuSO4 + 5H2O            hydrate dots
    H2SO4(aq) + 2NaOH(aq) -> ...          state symbols, which are ignored
    Fe^3+ + e- -> Fe^2+                   charges and the electron
    MnO4^- + 8H^+ + 5e- -> Mn^2+ + 4H2O   half equations

What it refuses to read, saying so rather than guessing:

    unknown element symbols (NaCL, Xx2O)
    an unspecified group (R, X, M, Ph), whose atoms are unknown
    condensed structural formulas (CH3-CH2-OH), polymers, organic shorthand
    anything with no reaction arrow in it

Input should already have been through notation.normalize().
"""

import re
from collections import Counter
from dataclasses import dataclass, field

from app.services.chemistry.elements import GROUP_SYMBOLS, SYMBOLS
from app.services.chemistry.notation import FORWARD_ARROW, REVERSIBLE_ARROW

ELECTRON = "e-"
STATE_SYMBOLS = ("aq", "s", "l", "g")
HYDRATE_MARKS = "*."

_ELEMENT = re.compile(r"[A-Z][a-z]?")
_DIGITS = re.compile(r"\d+")
_COEFFICIENT = re.compile(r"^(\d+)\s*(?=[A-Za-z(\[])")
_STATE = re.compile(r"\((?:" + "|".join(STATE_SYMBOLS) + r")\)", re.I)
_CHARGE = re.compile(r"\^(\d*)([+-])")
_WORD = re.compile(r"[A-Za-z][A-Za-z0-9()\[\]^+*.-]*")
_RUN_OF_LOWER = re.compile(r"[a-z]{2,}")

# A "+" between two species, not the one inside a charge. A charge is hidden behind a
# marker with its sign spelled as a letter first, so every "+" left over separates two
# species and "Fe^3+ + e-" splits in the one place it should.
_CHARGE_MARKER = "\x00"
_SIGN_LETTERS = {"+": "P", "-": "M"}
_HIDDEN_CHARGE = re.compile(_CHARGE_MARKER + r"(\d*)([PM])")
# Just the sign: the surrounding spaces are stripped from each piece afterwards, and
# matching them here would make the pattern ambiguous and slow on a long line.
_SEPARATOR = re.compile(r"\+")


@dataclass(frozen=True)
class Species:
    """One substance on one side of the arrow."""

    coefficient: int
    formula: str
    atoms: Counter[str]
    charge: int


@dataclass
class BalanceReport:
    """Whether the atoms and the charge come out the same on both sides."""

    readable: bool
    balanced: bool = False
    reversible: bool = False
    left: list[Species] = field(default_factory=list)
    right: list[Species] = field(default_factory=list)
    # element -> (atoms on the left, atoms on the right), only where they differ
    gaps: dict[str, tuple[int, int]] = field(default_factory=dict)
    charges: tuple[int, int] = (0, 0)
    unreadable: list[str] = field(default_factory=list)

    @property
    def charge_balanced(self) -> bool:
        return self.charges[0] == self.charges[1]

    def explain(self) -> str:
        """One sentence a teacher or a student can act on."""
        if not self.readable:
            return "This equation could not be read: " + ", ".join(self.unreadable) + "."
        if self.balanced:
            return "The equation is balanced."
        parts = [
            f"{element} ({left} on the left, {right} on the right)"
            for element, (left, right) in sorted(self.gaps.items())
        ]
        if not self.charge_balanced:
            parts.append(f"charge ({self.charges[0]:+d} left, {self.charges[1]:+d} right)")
        return "Not balanced: " + ", ".join(parts) + "."


def looks_like_equation(text: str) -> bool:
    """True if there is a reaction arrow with something on both sides of it."""
    arrow = _arrow(text)
    if arrow is None:
        return False
    left, _, right = text.partition(arrow)
    return bool(left.strip() and right.strip())


def extract_equation(line: str) -> str | None:
    """Pull the equation out of a line that also has prose on it.

    A model answer says "The reaction is H2 + O2 -> H2O", and the sentence is not part
    of the equation. Working outwards from the arrow, a species is taken only when a
    "+" joins it to the last one, so the walk stops at the first word of prose instead
    of swallowing it.
    """
    arrow = _arrow(line)
    if arrow is None:
        return None
    before, _, after = line.partition(arrow)

    left = _species_run(before.split(), from_end=True)
    right = _species_run(after.split(), from_end=False)
    if not left or not right:
        return None
    return f"{' '.join(left)} {arrow} {' '.join(right)}"


def _species_run(words: list[str], *, from_end: bool) -> list[str]:
    """The run of "species + species + ..." at one end of a list of words."""
    ordered = list(reversed(words)) if from_end else words
    run: list[str] = []
    expecting_species = True
    for word in ordered:
        if expecting_species:
            if _species(word) is None:
                break
            run.append(word)
            expecting_species = False
        elif word == "+":
            run.append(word)
            expecting_species = True
        else:
            break
    return list(reversed(run)) if from_end else run


def check_balance(text: str) -> BalanceReport:
    """Count the atoms on each side of the arrow.

    `readable` is False when the equation uses something this checker cannot count.
    That is not the same as unbalanced, and must never be reported as a mistake.
    """
    arrow = _arrow(text)
    if arrow is None:
        return BalanceReport(readable=False, unreadable=["there is no reaction arrow in it"])

    hidden = _CHARGE.sub(lambda m: _CHARGE_MARKER + m.group(1) + _SIGN_LETTERS[m.group(2)], text)
    left_text, _, right_text = hidden.partition(arrow)

    left, left_problems = _side(left_text)
    right, right_problems = _side(right_text)
    problems = left_problems + right_problems
    if problems or not left or not right:
        return BalanceReport(
            readable=False,
            reversible=arrow == REVERSIBLE_ARROW,
            unreadable=problems or ["one side of the arrow is empty"],
        )

    left_atoms, right_atoms = _total(left), _total(right)
    gaps = {
        element: (left_atoms.get(element, 0), right_atoms.get(element, 0))
        for element in sorted(set(left_atoms) | set(right_atoms))
        if left_atoms.get(element, 0) != right_atoms.get(element, 0)
    }
    charges = (
        sum(s.coefficient * s.charge for s in left),
        sum(s.coefficient * s.charge for s in right),
    )

    return BalanceReport(
        readable=True,
        balanced=not gaps and charges[0] == charges[1],
        reversible=arrow == REVERSIBLE_ARROW,
        left=left,
        right=right,
        gaps=gaps,
        charges=charges,
    )


def formula_atoms(formula: str) -> Counter[str] | None:
    """The atoms in one formula, or None when it cannot be read."""
    species = _species(formula.strip())
    return species.atoms if species else None


def unreadable_formulas(text: str) -> list[str]:
    """Formula-looking words in the text that are not valid element notation.

    This catches the typo a model makes often: NaCL for NaCl.

    A token is only reported when it looks chemical to begin with: it must carry a
    digit or a lower-case letter. That keeps out ordinary capitals that are not
    formulas at all - an acronym, a shouted word, and "[A]", which is how a
    concentration is written. The cost is that an all-capitals typo in something like
    KOH is not caught, which is the right way round: a wrong rejection throws away a
    question that was fine.
    """
    bad = []
    for word in _WORD.findall(text):
        # Sentence punctuation only. Brackets are part of the formula: stripping the
        # ")" off "H2O(l)" would leave an unbalanced bracket and condemn a good formula.
        candidate = word.strip(".,;:-")
        if not _could_be_formula(candidate) or _looks_like_prose(candidate):
            continue
        if _species(candidate) is None:
            bad.append(candidate)
    return bad


def _could_be_formula(word: str) -> bool:
    """Worth checking at all: starts with a capital and has a digit or a small letter."""
    if len(word) < 2 or not word[0].isupper():
        return False
    return any(character.isdigit() or character.islower() for character in word[1:])


def _looks_like_prose(word: str) -> bool:
    """An ordinary word such as "Calculate", rather than a formula."""
    letters = re.sub(r"[^A-Za-z]", "", _STATE.sub("", word))
    return bool(_RUN_OF_LOWER.search(letters))


def _arrow(text: str) -> str | None:
    if REVERSIBLE_ARROW in text:
        return REVERSIBLE_ARROW
    return FORWARD_ARROW if FORWARD_ARROW in text else None


def _side(text: str) -> tuple[list[Species], list[str]]:
    species: list[Species] = []
    problems: list[str] = []
    for part in _SEPARATOR.split(text.strip()):
        cleaned = _show_charge(part).strip()
        if not cleaned:
            continue
        parsed = _species(cleaned)
        if parsed is None:
            problems.append(f"'{cleaned}' is not a formula this checker can count")
        else:
            species.append(parsed)
    return species, problems


def _show_charge(text: str) -> str:
    """Put the hidden charges back, so the species reads as it was written."""
    signs = {letter: sign for sign, letter in _SIGN_LETTERS.items()}
    return _HIDDEN_CHARGE.sub(lambda m: "^" + m.group(1) + signs[m.group(2)], text)


def _species(text: str) -> Species | None:
    """One term such as "2H2O", "Ca(OH)2(s)" or "5e-"."""
    body = text.strip()
    if not body:
        return None

    coefficient = 1
    if found := _COEFFICIENT.match(body):
        coefficient = int(found.group(1))
        body = body[found.end() :]

    body, charge = _split_charge(body)
    body = _STATE.sub("", body).strip()

    if body in (ELECTRON, "e"):
        return Species(coefficient, ELECTRON, Counter(), -1)

    atoms = _atoms(body)
    return None if atoms is None else Species(coefficient, text.strip(), atoms, charge)


def _split_charge(body: str) -> tuple[str, int]:
    """Take "SO4^2-" apart into "SO4" and -2. Also reads the bare electron, "e-"."""
    if found := _CHARGE.search(body):
        size = int(found.group(1) or 1)
        sign = -1 if found.group(2) == "-" else 1
        return body[: found.start()] + body[found.end() :], size * sign
    if body == "e-":
        return ELECTRON, -1
    return body, 0


def _atoms(formula: str) -> Counter[str] | None:
    """Count the atoms in a formula with brackets and hydrate dots, or None.

    `groups` is a stack: an open bracket pushes a fresh count, and closing it folds
    that count into the one below, multiplied by whatever number follows the bracket.
    """
    groups: list[Counter[str]] = [Counter()]
    index = 0
    while index < len(formula):
        index = _read_piece(formula, index, groups)
        if index < 0:
            return None
    return groups[0] if len(groups) == 1 else None


def _read_piece(formula: str, index: int, groups: list[Counter[str]]) -> int:
    """Read one piece of a formula. Returns where to carry on, or -1 to give up."""
    character = formula[index]
    if character in "([":
        groups.append(Counter())
        return index + 1
    if character in ")]":
        return _close_group(formula, index, groups)
    if character in HYDRATE_MARKS:
        return _read_hydrate(formula, index, groups)
    if character.isspace():
        return index + 1
    return _read_element(formula, index, groups[-1])


def _close_group(formula: str, index: int, groups: list[Counter[str]]) -> int:
    if len(groups) == 1:
        return -1  # a bracket closed that was never opened
    inner = groups.pop()
    count, end = _count(formula, index + 1)
    _add(groups[-1], inner, count)
    return end


def _read_hydrate(formula: str, index: int, groups: list[Counter[str]]) -> int:
    """ "*5H2O": everything after the dot, counted that many times over."""
    count, start = _count(formula, index + 1)
    rest = _atoms(formula[start:])
    if rest is None:
        return -1
    _add(groups[-1], rest, count)
    return len(formula)


def _read_element(formula: str, index: int, into: Counter[str]) -> int:
    """Read one element symbol with its count. -1 when it is not an element at all."""
    found = _ELEMENT.match(formula, index)
    if found is None:
        return -1

    symbol = found.group()
    end = found.end()
    if symbol not in SYMBOLS:
        # Perhaps a one-letter symbol followed by a stray capital, as "CL" is "C" then
        # "L". Try the shorter symbol before giving up on the whole formula.
        if len(symbol) != 2 or symbol[0] not in SYMBOLS:
            return -1
        symbol, end = symbol[0], index + 1
    if symbol in GROUP_SYMBOLS:
        return -1  # readable chemistry whose atoms are unknown

    count, end = _count(formula, end)
    into[symbol] += count
    return end


def _count(text: str, index: int) -> tuple[int, int]:
    """The number at `index`, defaulting to 1, and where it ends."""
    found = _DIGITS.match(text, index)
    return (int(found.group()), found.end()) if found else (1, index)


def _add(into: Counter[str], atoms: Counter[str], times: int) -> None:
    for element, count in atoms.items():
        into[element] += count * times


def _total(species: list[Species]) -> Counter[str]:
    atoms: Counter[str] = Counter()
    for one in species:
        _add(atoms, one.atoms, one.coefficient)
    return atoms
