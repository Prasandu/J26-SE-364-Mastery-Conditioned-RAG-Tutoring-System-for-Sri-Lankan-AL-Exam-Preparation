"""TUT-014: verified worked examples for the tutor whiteboard. Signed-in students only;
deterministic, so no provider is called and nothing is stored."""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.auth import get_current_user_id
from app.services.teaching.actions import ValidatedTeaching
from app.services.teaching.worked_examples import solution_concentration

router = APIRouter(prefix="/teaching", tags=["teaching"])


class SolutionConcentrationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    solute: Annotated[str, Field(pattern=r"^[A-Za-z0-9()]{1,20}$")]  # display only, e.g. Na2CO3
    mass_g: Annotated[float, Field(gt=0, le=10_000, allow_inf_nan=False)]
    molar_mass_g_per_mol: Annotated[float, Field(gt=0, le=10_000, allow_inf_nan=False)]
    volume_cm3: Annotated[float, Field(gt=0, le=100_000, allow_inf_nan=False)]


@router.post("/worked-examples/solution-concentration", response_model=ValidatedTeaching)
def worked_solution_concentration(
    data: SolutionConcentrationIn,
    _user_id: str = Depends(get_current_user_id),
) -> ValidatedTeaching:
    """Mass -> amount -> concentration, every step recomputed and unit-checked."""
    return solution_concentration(
        solute=data.solute,
        mass_g=data.mass_g,
        molar_mass_g_per_mol=data.molar_mass_g_per_mol,
        volume_cm3=data.volume_cm3,
    )
