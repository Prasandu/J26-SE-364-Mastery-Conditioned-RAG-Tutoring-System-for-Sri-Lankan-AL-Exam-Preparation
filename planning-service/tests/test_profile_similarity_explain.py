from app.ai.explain import (
    build_template_explanation,
    generate_explanation,
    validate_explanation,
)
from app.services.profile_similarity import (
    build_profile_embedding,
    cosine_similarity,
    find_similar_students,
    save_profile_embedding,
)


def test_build_profile_embedding_is_fixed_length() -> None:
    values = {f"topic-{index}": 0.1 * (index + 1) for index in range(20)}

    vector = build_profile_embedding(values)

    assert len(vector) == 16
    assert vector[0] == 0.1
    assert vector[-1] == 0.6000000000000001


def test_cosine_similarity_is_bounded() -> None:
    left = [1.0, 0.0, 0.0]
    right = [0.5, 0.5, 0.0]

    similarity = cosine_similarity(left, right)

    assert 0.0 <= similarity <= 1.0
    assert similarity > 0.0


def test_validate_explanation_rejects_plan_external_topics_and_numbers() -> None:
    plan = {
        "mode": "predicted",
        "exam_date": "2026-03-01",
        "target_grade": "A",
        "topics": ["CHEM.CALC.MOLE", "CHEM.STRUCT.BOND"],
    }
    valid = (
        "This predicted plan is aimed at A and is scheduled before 2026-03-01. "
        "It prioritises CHEM.CALC.MOLE."
    )
    invalid = (
        "This predicted plan is aimed at A and is scheduled before 2026-03-01. "
        "It prioritises CHEM.ORG.ATOMS."
    )

    assert validate_explanation(plan, valid)
    assert not validate_explanation(plan, invalid)


def test_generate_explanation_uses_template_when_no_llm_is_given() -> None:
    plan = {
        "mode": "manual",
        "exam_date": "2026-04-01",
        "target_grade": "B",
        "topics": ["CHEM.CALC.MOLE", "CHEM.STRUCT.BOND"],
    }

    description = generate_explanation(plan)

    assert "B" in description
    assert "CHEM.CALC.MOLE" in description
    assert "manual" in description


def test_save_profile_embedding_and_similarity_lookup_round_trip() -> None:
    class DummySession:
        def __init__(self) -> None:
            self.rows = {}

        def get(self, model, student_id):
            return self.rows.get(student_id)

        def add(self, row):
            self.rows[row.student_id] = row

        def scalars(self, _):
            parent = self

            class Rows:
                def all(self):
                    return list(parent.rows.values())

            return Rows()

    session = DummySession()
    save_profile_embedding(session, "student-1", {"topic-1": 0.9, "topic-2": 0.7})
    save_profile_embedding(session, "student-2", {"topic-1": 0.8, "topic-2": 0.6})

    matches = find_similar_students(
        session,
        "student-1",
        mastery_by_topic={"topic-1": 0.9, "topic-2": 0.7},
        k=1,
    )

    assert matches
    assert matches[0].student_id == "student-2"
    assert matches[0].similarity > 0.0


def test_template_explanation_reuses_similar_student_strategy() -> None:
    plan = {
        "mode": "predicted",
        "exam_date": "2026-05-01",
        "target_grade": "A",
        "topics": ["CHEM.CALC.MOLE"],
    }
    explanation = build_template_explanation(
        plan,
        similar_students=[{"strategy": "balanced review pattern"}],
    )

    assert "balanced review pattern" in explanation
    assert "CHEM.CALC.MOLE" in explanation
