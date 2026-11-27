"""TUT-014: the structured teaching response validator and the deterministic worked example.

No provider, database or network: pure validation plus one route (auth checked with the
real Supabase dependency, which refuses a missing token before any work is done).
"""

import copy

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user_id
from app.main import app
from app.services.teaching.actions import parse_unit, validate_teaching_response
from app.services.teaching.worked_examples import significant, solution_concentration

client = TestClient(app)  # no `with`: the lifespan (DB + model warm-up) does not run


def proposal(**overrides):
    body = {
        "response_id": "r1",
        "language": "en",
        "spoken_text": "Divide the amount by the volume.",
        "citations": [{"source_id": "nie-resource-book", "page": 113}],
        "verified_steps": [
            {"id": "n", "kind": "given", "formula": "n = 0.25", "result": "0.250 mol"},
            {"id": "vcm", "kind": "given", "formula": "Vcm = 250", "result": "250 cm3"},
            {"id": "v", "kind": "unit_conversion", "formula": "V = Vcm / 1000", "result": "0.250 dm3"},
            {"id": "c", "kind": "calculation", "formula": "c = n / V", "result": "1.00 mol dm-3"},
        ],
        "visual_actions": [
            {"type": "writeEquation", "step_id": "v"},
            {"type": "writeEquation", "step_id": "c"},
            {"type": "highlightTerm", "step_id": "c", "term": "n"},
            {"type": "highlightStep", "step_id": "c"},
        ],
        "learning_mode": "worked_example",
    }
    body.update(overrides)
    return body


def check(body, sources=frozenset({"nie-resource-book"})):
    return validate_teaching_response(body, allowed_source_ids=set(sources))


def with_step(index, **changes):
    body = proposal()
    body["verified_steps"] = copy.deepcopy(body["verified_steps"])
    body["verified_steps"][index].update(changes)
    return body


def test_a_correct_response_is_verified_with_every_step_recomputed():
    result = check(proposal())

    assert result.status == "verified", result.problems
    assert [c.step_id for c in result.checks] == ["n", "vcm", "v", "c"]
    assert result.checks[-1].computed == pytest.approx(1.0)
    assert all(c.unit_checked for c in result.checks)
    assert len(result.response.visual_actions) == 4


@pytest.mark.parametrize(
    "index,changes,reason",
    [
        (3, {"result": "2.00 mol dm-3"}, "formula gives"),  # wrong number
        (3, {"result": "1.0 mol dm-3"}, None),  # fewer digits but correct rounding -> allowed
        (3, {"result": "1.00 mol"}, "does not follow"),  # wrong unit
        (2, {"formula": "V = Vcm / 100", "result": "2.50 dm3"}, "not that conversion"),  # wrong factor
        (2, {"formula": "V = Vcm * 1000", "result": "250000 dm3"}, "not that conversion"),
        (3, {"formula": "c = n / W"}, "not defined"),
        (3, {"formula": "c = __import__('os').getcwd()"}, "not allowed"),
        (3, {"formula": "c = n.real"}, "not allowed"),
        (3, {"formula": "c = 10 ** 10 ** 10"}, "too large"),
        (3, {"formula": "c = n / 0"}, "division by zero"),
        (3, {"formula": "c = n / V = 1"}, "name = expression"),
        (3, {"result": "about one"}, "start with a number"),
        (3, {"result": "1.00 furlongs"}, "unknown unit"),
        (0, {"label": "see https://example.com"}, "URL"),
        (0, {"label": "<img src=x onerror=alert(1)>"}, "markup"),
    ],
)
def test_wrong_or_unsafe_steps_reject_the_whole_response(index, changes, reason):
    result = check(with_step(index, **changes))

    if reason is None:
        assert result.status == "verified"
        return
    assert result.status == "rejected" and result.response is None
    assert any(reason in problem for problem in result.problems), result.problems


def test_an_invented_citation_rejects_the_response():
    result = check(proposal(citations=[{"source_id": "made-up-book", "page": 9}]))

    assert result.status == "rejected"
    assert "made-up-book" in result.problems[0]


def test_unknown_actions_are_dropped_never_executed():
    body = proposal()
    body["visual_actions"] = body["visual_actions"] + [
        {"type": "runScript", "code": "fetch('/steal')"},
        {"type": "openUrl", "url": "https://example.com"},
        "writeEquation",
    ]

    result = check(body)

    assert result.status == "partially_verified"
    assert {a.type for a in result.response.visual_actions} == {
        "writeEquation",
        "highlightTerm",
        "highlightStep",
    }
    assert sum("not in the allowed vocabulary" in p for p in result.problems) == 3


def test_actions_must_point_at_real_steps_and_terms():
    body = proposal()
    body["visual_actions"] = [
        {"type": "writeEquation", "step_id": "ghost"},
        {"type": "highlightTerm", "step_id": "c", "term": "x"},
        {"type": "writeEquation", "step_id": "c"},
    ]

    result = check(body)

    assert result.status == "partially_verified"
    assert [a.step_id for a in result.response.visual_actions] == ["c"]


def test_extra_fields_and_bad_shapes_are_refused():
    assert check(proposal(execute="rm -rf /")).status == "rejected"
    assert check(proposal(language="fr")).status == "rejected"
    assert check("not an object").status == "rejected"
    assert check(proposal(visual_actions=[{"type": "pause", "seconds": 3600}])).status == "rejected"


def test_numbers_without_derivable_units_are_checked_but_flagged():
    result = check(with_step(3, kind="calculation", formula="c = 0.25 / 0.25"))

    assert result.status == "partially_verified"
    assert any("units not derivable" in p for p in result.problems)


@pytest.mark.parametrize(
    "text,expected",
    [
        ("mol dm-3", {"mol": 1, "dm3": -1}),
        ("mol/dm3", {"mol": 1, "dm3": -1}),
        ("mol L-1", {"mol": 1, "dm3": -1}),
        ("g mol-1", {"g": 1, "mol": -1}),
        ("cm3", {"cm3": 1}),
        ("", {}),
    ],
)
def test_unit_notation(text, expected):
    assert dict(parse_unit(text)) == expected


@pytest.mark.parametrize(
    "value,text", [(0.25, "0.250"), (1.0, "1.00"), (250.0, "250"), (0.0123456, "0.0123")]
)
def test_significant_figures(value, text):
    assert significant(value) == text


def test_the_experiment_4_worked_example_is_fully_verified():
    # Na2CO3 standard solution (project CLAUDE.md, NIE practical handbook Exp. 4):
    # 26.5 g, M = 106 g mol-1, made up to 250 cm3 -> 1.00 mol dm-3.
    result = solution_concentration(solute="Na2CO3", mass_g=26.5, molar_mass_g_per_mol=106, volume_cm3=250)

    assert result.status == "verified", result.problems
    steps = {step.id: step.result for step in result.response.verified_steps}
    assert steps == {
        "m": "26.5 g",
        "mm": "106 g mol-1",
        "vcm": "250 cm3",
        "v": "0.250 dm3",
        "n": "0.250 mol",
        "c": "1.00 mol dm-3",
    }
    assert result.response.citations == []  # deterministic: nothing claimed from a source


def test_the_route_requires_a_signed_in_student():
    saved = app.dependency_overrides.pop(get_current_user_id, None)
    try:
        response = client.post(
            "/api/v1/teaching/worked-examples/solution-concentration",
            json={"solute": "Na2CO3", "mass_g": 26.5, "molar_mass_g_per_mol": 106, "volume_cm3": 250},
        )
        assert response.status_code == 401
    finally:
        if saved is not None:
            app.dependency_overrides[get_current_user_id] = saved


def test_the_route_returns_a_verified_example_and_validates_input():
    app.dependency_overrides[get_current_user_id] = lambda: "student-1"
    try:
        ok = client.post(
            "/api/v1/teaching/worked-examples/solution-concentration",
            json={"solute": "Na2CO3", "mass_g": 26.5, "molar_mass_g_per_mol": 106, "volume_cm3": 250},
        )
        bad = client.post(
            "/api/v1/teaching/worked-examples/solution-concentration",
            json={"solute": "<b>x</b>", "mass_g": -1, "molar_mass_g_per_mol": 0, "volume_cm3": 250},
        )
    finally:
        app.dependency_overrides.pop(get_current_user_id, None)

    assert ok.status_code == 200 and ok.json()["status"] == "verified"
    assert bad.status_code == 422
