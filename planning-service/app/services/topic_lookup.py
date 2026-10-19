"""Batch loading of curriculum topics.

The database is remote, so loading ~200 topics one ``session.get`` at a time
costs hundreds of round trips per request. Loading them once puts every topic
in the session's identity map, after which ``session.get(Topic, id)`` is free.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Topic


def preload_topics(session: Session) -> dict[str, Any]:
    """Load all topics in one query (once per session) and return them by ID.

    The identity map only holds weak references, so the topics are also kept
    in ``session.info``; otherwise they would be garbage-collected and every
    ``session.get`` would query again.
    """
    info = getattr(session, "info", None)
    if isinstance(info, dict) and "topics_by_id" in info:
        return info["topics_by_id"]
    topics = {topic.id: topic for topic in session.scalars(select(Topic)).all()}
    if isinstance(info, dict):
        info["topics_by_id"] = topics
    return topics
