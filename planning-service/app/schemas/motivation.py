from datetime import date
from typing import Literal

from pydantic import BaseModel

MotivationCategory = Literal["effort", "consistency", "recovery", "exam_week", "celebration"]


class MotivationResponse(BaseModel):
    date: date
    category: MotivationCategory | None = None
    message_id: str | None = None
    text: str | None = None
    # True when another component (well-being) asked to skip the card today.
    suppressed: bool = False
