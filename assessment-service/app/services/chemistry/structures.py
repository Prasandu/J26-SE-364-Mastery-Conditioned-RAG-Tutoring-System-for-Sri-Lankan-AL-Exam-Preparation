"""Marking a drawn structure by comparing molecular graphs.

A structural formula is a graph: atoms are its nodes, bonds its edges. Once the
reader has written a drawn structure as SMILES, deciding whether it earns the mark
is a graph comparison, not a judgement - so no AI decides it, and the same answer
is marked the same way every time.

Two kinds of marking point:

  {"smiles": "Oc1ccccc1"}    the answer must be this species
  {"smarts": "c1ccccc1"}     the answer must contain this group

A species match accepts any resonance form of what the scheme expects: a student who
draws the ortho carbanion of phenol rather than the para one has drawn the same
species, and the official scheme prints only one of them.
"""

import re
from dataclasses import dataclass

from rdkit import Chem, RDLogger
from rdkit.Chem.rdchem import ResonanceMolSupplier
from rdkit.Chem.rdMolDescriptors import CalcMolFormula

# RDKit writes its parse failures to stderr; we report them ourselves instead.
RDLogger.DisableLog("rdApp.*")

# How many resonance forms to enumerate before giving up. A conjugated system can
# have a great many, and a scheme never expects one past the first handful.
MOST_RESONANCE_FORMS = 32

# Slips a chemist makes writing SMILES by hand, with what the notation really means.
# Only repairs that leave the species unchanged belong here: dropping a stray "[+]"
# would turn a carbocation into an alkane, which is a wrong mark rather than no mark.
REPAIRS: tuple[tuple[re.Pattern[str], str, str], ...] = (
    (re.compile(r"(O{2,})H"), r"\1", "the H of -OOH is implicit in SMILES"),
    (re.compile(r"\[([A-Z][a-z]?H?\d*)\.\]"), r"[\1]", "a radical dot is not written in SMILES"),
)


@dataclass(frozen=True)
class ParsedStructure:
    """One structure read off a drawing, and what had to be fixed to read it."""

    smiles: str  # canonical, as RDKit writes it
    formula: str
    charge: int
    repaired: str | None = None  # what was corrected, for the teacher to see


def parse(smiles: str) -> ParsedStructure | None:
    """A structure from SMILES, repairing the slips above. None if it cannot be read."""
    text = (smiles or "").strip()
    if not text:
        return None

    mol = Chem.MolFromSmiles(text)
    note = None
    if mol is None:
        fixed = _repaired(text)
        if fixed is None:
            return None
        mol, note = fixed

    return ParsedStructure(
        smiles=Chem.MolToSmiles(mol),
        formula=CalcMolFormula(mol),
        charge=Chem.GetFormalCharge(mol),
        repaired=note,
    )


def same_species(student: str, expected: str, *, allow_resonance: bool = True) -> bool:
    """Whether the student drew the species the scheme expects."""
    drawn, wanted = parse(student), parse(expected)
    if drawn is None or wanted is None:
        return False
    if drawn.smiles == wanted.smiles:
        return True
    if not allow_resonance:
        return False
    # A resonance form is the same species drawn differently, so compare the whole
    # set each side can take - the scheme prints one form, the student may draw another.
    return bool(_resonance_forms(drawn.smiles) & _resonance_forms(wanted.smiles))


def contains(student: str, smarts: str) -> bool:
    """Whether the drawn structure contains the group the scheme asks for."""
    drawn = parse(student)
    pattern = Chem.MolFromSmarts(smarts)
    if drawn is None or pattern is None:
        return False
    mol = Chem.MolFromSmiles(drawn.smiles)
    return mol is not None and mol.HasSubstructMatch(pattern)


def _repaired(smiles: str) -> tuple[Chem.Mol, str] | None:
    for pattern, replacement, why in REPAIRS:
        fixed = pattern.sub(replacement, smiles)
        if fixed == smiles:
            continue
        mol = Chem.MolFromSmiles(fixed)
        if mol is not None:
            return mol, why
    return None


def _resonance_forms(smiles: str) -> set[str]:
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return set()
    flags = Chem.UNCONSTRAINED_CATIONS | Chem.UNCONSTRAINED_ANIONS
    forms = {Chem.MolToSmiles(mol)}
    for index, form in enumerate(ResonanceMolSupplier(mol, flags)):
        if index >= MOST_RESONANCE_FORMS:
            break
        forms.add(Chem.MolToSmiles(form))
    return forms
