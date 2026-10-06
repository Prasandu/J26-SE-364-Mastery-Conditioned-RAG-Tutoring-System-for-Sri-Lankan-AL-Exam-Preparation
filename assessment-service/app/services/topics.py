from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ConflictError, ContentValidationError
from app.models import Topic
from app.schemas.admin import TopicIn


def list_topics(db: Session) -> Sequence[Topic]:
    return db.scalars(select(Topic).order_by(Topic.code)).all()


def topics_by_code(db: Session) -> dict[str, Topic]:
    return {topic.code: topic for topic in list_topics(db)}


def create_topic(db: Session, data: TopicIn) -> Topic:
    existing = topics_by_code(db)
    if data.code in existing:
        raise ConflictError(f"Topic {data.code} already exists")

    parent = None
    if data.parent_code is not None:
        parent = existing.get(data.parent_code)
        if parent is None:
            raise ContentValidationError(
                "The topic has problems", [f"Unknown parent topic {data.parent_code}"]
            )

    topic = Topic(code=data.code, name=data.name, parent_id=parent.id if parent else None)
    db.add(topic)
    db.commit()
    return topic
