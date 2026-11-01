"""Small, deterministic retrieval hints; they select evidence, never manufacture an answer."""

import re
import unicodedata

from app.knowledge.models import KnowledgeChunk

TOPIC_VERSION = "lab-topics-2"
_WASH = re.compile(r"\b(?:wash(?:ed|ing)?|clean(?:ed|ing)?|rins(?:e|ed|ing))\b|පිරිසිදු|සේද|සෝද")
_GLASSWARE = re.compile(
    r"\b(?:instruments?|equipment|apparatus|glassware|flasks?|beakers?)\b|උපකරණ|වීදුරු|ප්ලාස්කු"
)
_TRANSFER = re.compile(r"\b(?:watch\s*glass|funnel|washings|transfer)\b|පුනීල|ඔරලෝසු")


def _text(text: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text).replace("\u200d", "")).casefold()


def lab_topic(question: str) -> str | None:
    text = _text(question)
    if not _WASH.search(text):
        return None
    if _TRANSFER.search(text):
        return "quantitative_rinsing"
    if _GLASSWARE.search(text):
        return "clean_glassware"
    return None


def topic_query(question: str) -> str:
    hints = {
        "clean_glassware": "clean glassware apparatus before experiment ensure accurate results",
        "quantitative_rinsing": (
            "wash watch glass funnel distilled water transfer washings into flask"
        ),
    }
    hint = hints.get(lab_topic(question) or "")
    return f"{question}\n{hint}" if hint else question


def topic_matches(question: str, chunks: list[KnowledgeChunk]) -> list[KnowledgeChunk]:
    topic = lab_topic(question)
    if topic is None:
        return []
    scored: list[tuple[int, KnowledgeChunk]] = []
    for chunk in chunks:
        if not chunk.in_scope:
            continue
        text = _text(chunk.text)
        score = 0
        if topic == "clean_glassware":
            if re.search(r"clean(?:ed)? glassware|glassware.{0,35}clean", text):
                score = 1 + 10 * int("accurate results" in text)
        elif "washings" in text and "flask" in text:
            score = 3
        elif "wash" in text and "watch glass" in text and "funnel" in text:
            score = 2
        if score:
            scored.append((score, chunk))
    scored.sort(key=lambda pair: (-pair[0], pair[1].chunk_id))
    return [chunk for _, chunk in scored[:2]]


def focus_evidence(question: str, text: str) -> str:
    """For a cleaning-reason question, quote the reason rather than a full cleaning recipe.

    The excerpt is an unchanged source sentence, so supporting spans and page provenance remain
    verifiable. How-to questions and passages without a direct reason retain their full text.
    """
    if lab_topic(question) != "clean_glassware" or not re.search(
        r"\b(?:why|reason|purpose)\b|ඇයි|මන්ද|හේතුව", _text(question)
    ):
        return text
    for match in re.finditer(r"[^.!?\n]+(?:[.!?]|$)", text):
        sentence = match.group(0)
        if "clean glassware" in _text(sentence) and "accurate results" in _text(sentence):
            return sentence.strip()
    return text
