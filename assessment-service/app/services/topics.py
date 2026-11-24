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

    topic = Topic(
        code=data.code,
        name=data.name,
        parent_id=parent.id if parent else None,
        content=as_content(data.contents),
    )
    db.add(topic)
    db.commit()
    return topic


def rename_topic(db: Session, code: str, name: str) -> Topic:
    """Correct a topic's name. The code is what papers refer to, so it never changes."""
    topic = db.scalars(select(Topic).where(Topic.code == code)).first()
    if topic is None:
        raise ContentValidationError("The topic has problems", [f"Unknown topic {code}"])
    topic.name = name
    db.commit()
    return topic


def as_content(contents: list[str]) -> str | None:
    """Bullets as one block of text, one per line. Empty means the syllabus had none."""
    return "\n".join(contents) or None


def topic_contents(topic: Topic) -> list[str]:
    """The bullets back as a list."""
    return topic.content.splitlines() if topic.content else []


def set_topic_content(db: Session, code: str, contents: list[str]) -> Topic:
    """Replace what a topic covers. Used when the syllabus file is re-read."""
    topic = db.scalars(select(Topic).where(Topic.code == code)).first()
    if topic is None:
        raise ContentValidationError("The topic has problems", [f"Unknown topic {code}"])
    topic.content = as_content(contents)
    db.commit()
    return topic
