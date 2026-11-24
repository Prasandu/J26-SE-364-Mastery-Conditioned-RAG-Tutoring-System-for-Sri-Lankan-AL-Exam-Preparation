from app.services.adaptive_hints.hint_engine import choose_hint_level


def test_first_attempt_gives_level_1():
    assert choose_hint_level(attempts=0, hints_used=0, requested_full_solution=False) == 1


def test_hints_used_increments_level():
    assert choose_hint_level(attempts=1, hints_used=1, requested_full_solution=False) == 2
    assert choose_hint_level(attempts=2, hints_used=2, requested_full_solution=False) == 3


def test_level_caps_at_5():
    assert choose_hint_level(attempts=10, hints_used=10, requested_full_solution=False) == 5


def test_requested_full_solution_always_gives_level_5():
    assert choose_hint_level(attempts=0, hints_used=0, requested_full_solution=True) == 5
