from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.services.rag.retrieval import RetrievedChunk, search_chunks
from app.services.tutoring.llm_adapter import get_llm_provider

# Starting value, calibrated against two real observations: genuinely
# relevant Chemistry questions scored 0.46-0.62, while an unrelated
# question ("capital of France") scored 0.32-0.35 against the same corpus.
# 0.4 sits safely between those. Not exhaustively tuned — revisit with a
# larger labeled test set later.
MIN_SIMILARITY = 0.4

TOP_K = 5

SYSTEM_PROMPT_TEMPLATE = """You are a Chemistry tutor for Sri Lankan G.C.E. Advanced Level students.

Answer ONLY using the context passages below, taken from the official NIE Chemistry \
syllabus and resource book. Do not use outside knowledge. Preserve chemical formulas, \
symbols and units exactly as written in the context.

If the context does not contain enough information to answer the question, say so \
clearly instead of guessing.

Respond in {language_name}.

Context passages:
{context}
"""

LANGUAGE_NAMES = {"en": "English", "si": "Sinhala"}


@dataclass
class GroundedAnswer:
    answer: str
    citations: list[RetrievedChunk]
    grounded: bool


def _format_context(chunks: list[RetrievedChunk]) -> str:
    parts = []
    for i, c in enumerate(chunks, 1):
        parts.append(f"[{i}] ({c.document_title}, Unit {c.unit}, page {c.page_number})\n{c.content}")
    return "\n\n".join(parts)


def answer_question(db: Session, question: str, language: str = "en") -> GroundedAnswer:
    results = search_chunks(db, question, top_k=TOP_K)
    relevant = [r for r in results if r.similarity >= MIN_SIMILARITY]

    if not relevant:
        return GroundedAnswer(
            answer=(
                "I don't have enough information in the syllabus/resource book to "
                "answer this question confidently. Please rephrase or ask your teacher."
            ),
            citations=[],
            grounded=False,
        )

    language_name = LANGUAGE_NAMES.get(language, "English")
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        language_name=language_name, context=_format_context(relevant)
    )

    provider = get_llm_provider()
    answer = provider.generate_response(system_prompt, question)

    return GroundedAnswer(answer=answer, citations=relevant, grounded=True)
