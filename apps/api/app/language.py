"""Script detection only; preserves student text and never infers answer correctness."""

import re
import unicodedata

_SINHALA = re.compile(r"[\u0d85-\u0dc6]")
_LATIN = re.compile(r"[A-Za-z]")


def text_locale(text: str, fallback: str = "en") -> str:
    normalized = unicodedata.normalize("NFC", text)
    if _SINHALA.search(normalized):
        return "si"
    if _LATIN.search(normalized):
        return "en"
    return fallback
