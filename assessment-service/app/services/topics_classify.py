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
import tempfile
from collections.abc import Sequence
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.classify import QuestionToClassify, TopicClassifier
from app.ai.vision import Image
from app.ai.vision_classify import VisionTopicClassifier
from app.errors import ConflictError, ContentValidationError, NotFoundError, ProviderError
from app.models import MarkingPoint, ModelAnswer, Paper, Question, SuggestionStatus, TopicSuggestion, utcnow
from app.services.pdf import render_pages_for_classification
from app.services.storage import FileStore
from app.services.topics import topics_by_code

# The one fixed description every MCQ answer-key point gets (see
# app/services/drafts.py's _answer_key) - real subject content, never this.
_GENERIC_MCQ_DESCRIPTION = "Correct option"

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


def _classification_text(db: Session, question: Question) -> str:
    """What to show the classifier for this question.

    A past paper's own question is often textless (see
    app/services/papers.py's create_past_paper_shell) - the real wording lives only
    in its stored PDF, never as data. When that happens, the marking scheme's own
    OCR'd content (what earns each mark, and the model answer) is real subject text
    and the next best thing to classify from - except for an MCQ answer key, which
    never carries any ("Correct option" says nothing about the chemistry).
    """
    if question.text:
        return question.text

    descriptions = db.scalars(
        select(MarkingPoint.description).where(
            MarkingPoint.question_id == question.id, MarkingPoint.description != _GENERIC_MCQ_DESCRIPTION
        )
    ).all()
    model_answer = db.scalars(
        select(ModelAnswer.answer_text).where(ModelAnswer.question_id == question.id)
    ).first()
    return "\n".join(part for part in [model_answer, *descriptions] if part)


def classify_questions(
    db: Session,
    classifier: TopicClassifier,
    question_ids: Sequence[int] | None = None,
    *,
    limit: int = MOST_PER_RUN,
    vision_classifier: VisionTopicClassifier | None = None,
    store: FileStore | None = None,
) -> list[TopicSuggestion]:
    """Classify the given questions, or every untagged one when none are named.

    A question that already has a pending suggestion is skipped - this is what makes
    running the same batch twice safe rather than making a duplicate every time.

    A question with real text to classify from (its own, or - failing that - its
    marking scheme's, see _classification_text) goes to the text classifier, batched.
    A question with neither (a pure MCQ answer key names no subject content at all)
    goes to vision_classifier instead, when one is given - batched by paper, one
    call per paper covering every such question on it, since they share the same
    page images - otherwise skipped rather than asking either model to guess.
    """
    known = topics_by_code(db)
    if not known:
        raise ContentValidationError("Cannot classify", ["No syllabus topics exist yet"])

    if question_ids is not None:
        questions = list(db.scalars(select(Question).where(Question.id.in_(question_ids))).all())
    else:
        questions = list(untagged_questions(db, limit=limit))

    pending_free = [q for q in questions if pending_suggestion(db, q.id) is None]
    texts = {q.id: _classification_text(db, q) for q in pending_free}

    text_batch = [q for q in pending_free if texts[q.id]]
    vision_batch = (
        [q for q in pending_free if not texts[q.id]]
        if vision_classifier is not None and store is not None
        else []
    )

    created: list[TopicSuggestion] = []
    if text_batch:
        created.extend(_classify_by_text(db, classifier, text_batch, texts, known))
    if vision_batch:
        created.extend(_classify_by_vision(db, vision_classifier, store, vision_batch, known))
    return created


def _classify_by_text(
    db: Session, classifier: TopicClassifier, to_ask: list[Question], texts: dict[int, str], known: dict
) -> list[TopicSuggestion]:
    topic_list = [(topic.code, topic.name) for topic in known.values()]
    try:
        answers = classifier.classify(
            [QuestionToClassify(question_id=q.id, label=q.full_label, text=texts[q.id]) for q in to_ask],
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


def _classify_by_vision(
    db: Session,
    vision_classifier: VisionTopicClassifier,
    store: FileStore,
    to_ask: list[Question],
    known: dict,
) -> list[TopicSuggestion]:
    """One vision call per paper, covering every pending question on it at once -
    unlike one call per question, a 50-question MCQ paper then costs one call (and
    one PDF render) instead of 50. A failure for one paper's batch is logged and
    skipped rather than failing the whole run, so the rest still get classified."""
    topic_list = [(topic.code, topic.name) for topic in known.values()]
    by_paper: dict[int, list[Question]] = {}
    for question in to_ask:
        by_paper.setdefault(question.section.paper_id, []).append(question)

    created = []
    for questions in by_paper.values():
        images = _render_paper_pages(store, questions[0].section.paper)
        if not images:
            continue
        labels = [q.full_label for q in questions]
        try:
            results = vision_classifier.classify_pages(labels=labels, topics=topic_list, images=images)
        except Exception:
            logger.exception("Vision topic classifier failed for %d question(s)", len(questions))
            continue
        for question in questions:
            result = results.get(question.full_label)
            if result is None:
                continue
            valid_codes = [choice.code for choice in result.topics if choice.code in known]
            suggestion = TopicSuggestion(
                question_id=question.id,
                suggested_codes=valid_codes,
                confidence=result.confidence,
                reason=result.reason,
                model=vision_classifier.name,
                question_text=question.text,
                status=SuggestionStatus.PENDING,
            )
            db.add(suggestion)
            created.append(suggestion)
    db.commit()
    return created


def _render_paper_pages(store: FileStore, paper: Paper) -> list[Image]:
    """Every page of the paper's stored PDF - the one shared image set every
    pending vision question on it is classified from in a single call. Empty when
    there is no PDF, or no page count recorded for it."""
    if paper.file_key is None or not paper.page_count:
        return []
    pdf_bytes = store.load(paper.file_key)
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        path = Path(tmp.name)
    try:
        return render_pages_for_classification(path, list(range(1, paper.page_count + 1)))
    finally:
        path.unlink(missing_ok=True)


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
