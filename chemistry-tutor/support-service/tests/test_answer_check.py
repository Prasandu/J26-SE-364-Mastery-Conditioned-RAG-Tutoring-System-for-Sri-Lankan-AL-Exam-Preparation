from app.services.adaptive_hints.answer_check import answers_match


def test_exact_numeric_match():
    assert answers_match("0.5", "0.5") is True


def test_numeric_match_with_unit_suffix():
    # Hint text shows "= 0.5 mol", so students often type the unit too.
    assert answers_match("0.5 mol", "0.5") is True
    assert answers_match("0.5mol", "0.5") is True


def test_numeric_match_with_whitespace():
    assert answers_match("  0.5  ", "0.5") is True


def test_incorrect_number_does_not_match():
    assert answers_match("5", "0.5") is False


def test_non_numeric_falls_back_to_string_match():
    assert answers_match("sodium chloride", "Sodium Chloride") is True
    assert answers_match("wrong answer", "correct answer") is False


def test_fraction_matches_equivalent_decimal():
    assert answers_match("1/2", "0.5") is True


def test_scientific_notation_matches():
    assert answers_match("6.022*10^23", "6.022e23") is True


def test_percentage_sign_is_ignored():
    assert answers_match("72.73%", "72.73") is True


def test_rounded_answer_within_tolerance():
    # verified answer is a rounded repeating decimal (32/44 * 100)
    assert answers_match("72.727", "72.73") is True


def test_expression_evaluates_before_comparing():
    assert answers_match("2 + 3", "5") is True
