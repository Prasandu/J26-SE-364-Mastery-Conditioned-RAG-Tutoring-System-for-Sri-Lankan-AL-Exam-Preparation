"""Start planning-service for the journey with a test topic registry.

The real shared/contracts/topic-registry.v1.json has no approved alias yet (DAT-009), so
every real mark is quarantined - correctly. The journey needs to show both sides: quarantine
while an alias is unreviewed, and mastery once it is approved. It therefore points the
planner at a registry file in its own temporary directory (JOURNEY_TOPIC_REGISTRY), whose
only alias maps the journey's fixture topic code. Nothing in the repository changes.
"""

import os
from pathlib import Path

import uvicorn

import app.services.topic_registry as topic_registry

topic_registry.load_registry.__defaults__ = (
    Path(os.environ["JOURNEY_TOPIC_REGISTRY"]),
    topic_registry.CONTRACTS / "topics.json",
)

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=int(os.environ["JOURNEY_PORT"]), log_level="warning")
