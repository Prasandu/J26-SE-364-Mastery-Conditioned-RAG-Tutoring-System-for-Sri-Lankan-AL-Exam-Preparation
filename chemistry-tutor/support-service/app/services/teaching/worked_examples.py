"""TUT-014 Mode B: deterministic worked examples - no language model involved.

The numbers come from the caller (the student's problem or an approved practical) and
are computed here; the same validator that checks generated responses checks these, so
a whiteboard never shows a step that was not recomputed.

Only English narration for now: Sinhala narration needs teacher-reviewed wording
(project policy: generated Sinhala chemistry text stays draft until reviewed).
"""

from __future__ import annotations

import math
import uuid
from decimal import ROUND_HALF_UP, Decimal

from app.services.teaching.actions import ValidatedTeaching, validate_teaching_response

SIGNIFICANT_FIGURES = 3


def significant(value: float, figures: int = SIGNIFICANT_FIGURES) -> str:
    """0.25 -> '0.250', 1.0 -> '1.00', 250 -> '250' (trailing zeros kept)."""
    if value == 0:
        return "0." + "0" * (figures - 1)
    decimals = figures - 1 - math.floor(math.log10(abs(value)))
    quantum = Decimal(1).scaleb(-decimals) if decimals > 0 else Decimal(1)
    rounded = Decimal(repr(value)).quantize(quantum, rounding=ROUND_HALF_UP)
    return f"{rounded:f}"


def plain(value: float) -> str:
    """A given value exactly as entered: 26.5 -> '26.5', 250.0 -> '250'."""
    text = f"{Decimal(repr(value)).normalize():f}"
    return text


def solution_concentration(
    *,
    solute: str,
    mass_g: float,
    molar_mass_g_per_mol: float,
    volume_cm3: float,
) -> ValidatedTeaching:
    """c = n / V with n = m / M and V converted from cm3 to dm3 (e.g. 26.5 g of a
    106 g mol-1 solute made up to 250 cm3 gives 1.00 mol dm-3)."""
    volume_dm3 = volume_cm3 / 1000
    amount = mass_g / molar_mass_g_per_mol
    concentration = amount / volume_dm3
    steps = [
        {
            "id": "m",
            "kind": "given",
            "label": f"Mass of {solute}",
            "formula": f"m = {plain(mass_g)}",
            "result": f"{plain(mass_g)} g",
        },
        {
            "id": "mm",
            "kind": "given",
            "label": f"Molar mass of {solute}",
            "formula": f"M = {plain(molar_mass_g_per_mol)}",
            "result": f"{plain(molar_mass_g_per_mol)} g mol-1",
        },
        {
            "id": "vcm",
            "kind": "given",
            "label": "Volume of solution",
            "formula": f"Vcm = {plain(volume_cm3)}",
            "result": f"{plain(volume_cm3)} cm3",
        },
        {
            "id": "v",
            "kind": "unit_conversion",
            "label": "Volume in cubic decimetres",
            "formula": "V = Vcm / 1000",
            "result": f"{significant(volume_dm3)} dm3",
        },
        {
            "id": "n",
            "kind": "calculation",
            "label": "Amount of solute",
            "formula": "n = m / M",
            "result": f"{significant(amount)} mol",
        },
        {
            "id": "c",
            "kind": "calculation",
            "label": "Concentration",
            "formula": "c = n / V",
            "result": f"{significant(concentration)} mol dm-3",
        },
    ]
    actions = [
        {"type": "writeEquation", "step_id": "v"},
        {"type": "pause", "seconds": 1.5},
        {"type": "writeEquation", "step_id": "n"},
        {"type": "pause", "seconds": 1.5},
        {"type": "writeEquation", "step_id": "c"},
        {"type": "highlightStep", "step_id": "c"},
    ]
    response = {
        "response_id": str(uuid.uuid4()),
        "language": "en",
        "spoken_text": (
            "First change the volume from cubic centimetres to cubic decimetres. "
            "Then find the amount in moles by dividing the mass by the molar mass. "
            "Finally divide the amount by the volume to get the concentration."
        ),
        "citations": [],
        "verified_steps": steps,
        "visual_actions": actions,
        "learning_mode": "worked_example",
    }
    return validate_teaching_response(response, allowed_source_ids=set())
