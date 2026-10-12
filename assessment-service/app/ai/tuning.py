"""How every model call is tuned. One file, so no two callers disagree.

Model names are not here: they come from the settings (app/config.py) and the provider
table (app/ai/judge.py). What is here is everything else that decides how a call
behaves, and in particular the temperature.

Temperature is the one setting that has to be chosen per job rather than per provider:

- DETERMINISTIC (0) for anything that evaluates: marking an answer, and critiquing a
  generated question. The same input has to give the same answer, or a research result
  cannot be repeated and a student could be marked differently on a resit.
- AUTHORING (0.7) for writing questions, where sameness is the problem: a paper of
  five near-identical questions is no use.

Not every provider honours temperature exactly, and none promise bit-for-bit repeats.
Asking for 0 is the strongest thing available, not a guarantee.
"""

import json

from pydantic import BaseModel

# Evaluation: marking, judging, critiquing.
DETERMINISTIC_TEMPERATURE = 0.0
# Writing new questions, where some variety is the point.
AUTHORING_TEMPERATURE = 0.7

# Busy (503), rate-limited (429) or a temporary server error: wait 2s, 4s, 8s, 16s.
RETRY_ATTEMPTS = 5
RETRY_STATUS_CODES = [429, 500, 502, 503, 504]

JUDGING_TIMEOUT_SECONDS = 120.0
AUTHORING_TIMEOUT_SECONDS = 180.0
VISION_TIMEOUT_SECONDS = 180.0
MAX_OUTPUT_TOKENS = 32768


def json_instruction(shape: type[BaseModel]) -> str:
    """Gemini is told the reply shape through its API; other providers in the prompt."""
    return "Reply with JSON only, matching this JSON schema:\n" + json.dumps(
        shape.model_json_schema(), indent=2
    )
