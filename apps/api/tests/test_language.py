import unicodedata

import pytest

from app.language import text_locale


@pytest.mark.parametrize(
    "question,fallback,expected",
    [
        ("Why is a funnel used?", "si", "en"),
        ("පුනීලයක් භාවිත කරන්නේ ඇයි?", "en", "si"),
        ("Na₂CO₃ ග්‍රෑම් 26.5", "en", "si"),
        ("26.5", "si", "si"),
    ],
)
def test_question_language_overrides_ui(question: str, fallback: str, expected: str) -> None:
    assert text_locale(question, fallback) == expected
    assert text_locale(unicodedata.normalize("NFD", question), fallback) == expected
