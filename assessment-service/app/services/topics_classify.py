"""Batch topic classification: ask the model, validate, hold for review, apply on approval.

Four steps, and only the last one touches a question's real topics:

1. classify_questions   ask the model, store each answer as a pending TopicSuggestion
2. list_suggestions     for a person to read
3. approve_suggestion   write the (possibly edited) codes onto the question's topics
4. reject_suggestion    leave the question untouched

Running step 1 again is always safe. A question that already has a pending
suggestion is skipped, so a batch job interrupted halfway (a quota limit, a crash)
can simply be run again and only classifies what it has not already asked about -
this is what the prompt that asked for this tool calls "resumable and safe against
duplicate updates".

An AI-suggested code is never treated as correct on its own: it is checked against
the syllabus's real topic list before it is even stored (see _known_codes), and it
never reaches Question.topics until a named person approves it.
"""

import logging
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.classify import QuestionToClassify, TopicClassifier
from app.errors import ConflictError, ContentValidationError, NotFoundError, ProviderError
from app.models import Question, SuggestionStatus, TopicSuggestion, utcnow
from app.services.topics import topics_by_code

logger = logging.getLogger(__name__)

MOST_PER_RUN = 100


def pending_suggestion(db: Session, question_id: int) -> TopicSuggestion | None:
    return db.scalars(
        select(TopicSuggestion).where(
            TopicSuggestion.question_id == question_id,
            TopicSuggestion.status == SuggestionStatus.PENDING,
        )
    ).first()


def untagged_questions(db: Session, *, limit: int = MOST_PER_RUN) -> Sequence[Question]:
    """Leaf questions (not a parent with sub-questions) that have no topic at all."""
    return db.scalars(
        select(Question)
        .where(~Question.topics.any(), ~Question.sub_questions.any())
        .order_by(Question.id)
        .limit(limit)
    ).all()


def classify_questions(
    db: Session,
    classifier: TopicClassifier,
    question_ids: Sequence[int] | None = None,
    *,
    limit: int = MOST_PER_RUN,
) -> list[TopicSuggestion]:
    """Classify the given questions, or every untagged one when none are named.

    A question that already has a pending suggestion is skipped - this is what makes
    running the same batch twice safe rather than making a duplicate every time.
    """
    known = topics_by_code(db)
    if not known:
        raise ContentValidationError("Cannot classify", ["No syllabus topics exist yet"])

    if question_ids is not None:
        questions = [q for q in db.scalars(select(Question).where(Question.id.in_(question_ids))).all()]
    else:
        questions = list(untagged_questions(db, limit=limit))

    to_ask = [q for q in questions if pending_suggestion(db, q.id) is None]
    if not to_ask:
        return []

    topic_list = [(topic.code, topic.name) for topic in known.values()]
    try:
        answers = classifier.classify(
            [QuestionToClassify(question_id=q.id, label=q.full_label, text=q.text) for q in to_ask],
            topic_list,
        )
    except Exception as error:  # network, quota, or a reply that is not valid JSON
        # The provider's own exception text can hold request internals, so it is
        # logged here, server-side only, and never put in the message a caller sees.
        logger.exception("Topic classifier call failed for %d question(s)", len(to_ask))
        raise ProviderError(
            "The classifier could not be reached. Nothing was changed - try again shortly."
        ) from error
    by_id = {q.id: q for q in to_ask}

    created = []
    for answer in answers:
        question = by_id.get(answer.question_id)
        if question is None:
            continue  # the model answered about an id it was not asked about
        valid_codes = [choice.code for choice in answer.topics if choice.code in known]
        suggestion = TopicSuggestion(
            question_id=question.id,
            suggested_codes=valid_codes,
            confidence=answer.confidence,
            reason=answer.reason,
            model=classifier.name,
            question_text=question.text,
            status=SuggestionStatus.PENDING,
        )
        db.add(suggestion)
        created.append(suggestion)
    db.commit()
    return created


def list_suggestions(
    db: Session, *, status: SuggestionStatus | None = None, question_id: int | None = None
) -> Sequence[TopicSuggestion]:
    stmt = select(TopicSuggestion).order_by(TopicSuggestion.id)
    if status is not None:
        stmt = stmt.where(TopicSuggestion.status == status)
    if question_id is not None:
        stmt = stmt.where(TopicSuggestion.question_id == question_id)
    return db.scalars(stmt).all()


def get_suggestion(db: Session, suggestion_id: int) -> TopicSuggestion:
    suggestion = db.get(TopicSuggestion, suggestion_id)
    if suggestion is None:
        raise NotFoundError("Topic suggestion not found")
    return suggestion


def approve_suggestion(
    db: Session, suggestion_id: int, decided_by: str, codes: Sequence[str] | None = None
) -> TopicSuggestion:
    """Apply the suggestion - or, if `codes` is given, whatever subset a reviewer kept.

    `codes` lets a reviewer accept only some of what the model suggested; the full
    suggestion is never edited in place, so what the model actually said stays on
    the record regardless of what gets approved.
    """
    suggestion = get_suggestion(db, suggestion_id)
    if suggestion.status != SuggestionStatus.PENDING:
        raise ConflictError(f"This suggestion was already {suggestion.status.value}")

    chosen = list(codes) if codes is not None else list(suggestion.suggested_codes)
    known = topics_by_code(db)
    if unknown := sorted(set(chosen) - set(known)):
        raise ContentValidationError(
            "Unknown topic code(s)", [f"'{c}' is not a syllabus topic" for c in unknown]
        )

    question = db.get(Question, suggestion.question_id)
    if question is None:
        raise NotFoundError("The question this suggestion was for no longer exists")
    question.topics = [known[code] for code in chosen]

    suggestion.status = SuggestionStatus.APPROVED
    suggestion.approved_codes = chosen
    suggestion.decided_by = decided_by
    suggestion.decided_at = utcnow()
    db.commit()
    return suggestion


def reject_suggestion(db: Session, suggestion_id: int, decided_by: str) -> TopicSuggestion:
    suggestion = get_suggestion(db, suggestion_id)
    if suggestion.status != SuggestionStatus.PENDING:
        raise ConflictError(f"This suggestion was already {suggestion.status.value}")

    suggestion.status = SuggestionStatus.REJECTED
    suggestion.decided_by = decided_by
    suggestion.decided_at = utcnow()
    db.commit()
    return suggestion
