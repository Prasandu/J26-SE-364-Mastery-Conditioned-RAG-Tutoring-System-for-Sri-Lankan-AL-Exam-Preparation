from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_all_six_new_questions_exist():
    response = client.get("/api/v1/questions")
    codes = {q["question_code"] for q in response.json()}
    expected = {
        "CHEM-U3-Q004",
        "CHEM-U3-Q005",
        "CHEM-U1-Q001",
        "CHEM-U1-Q002",
        "CHEM-U2-Q001",
        "CHEM-U2-Q002",
    }
    assert expected.issubset(codes)


def test_molarity_question_correct_answer():
    response = client.post(
        "/api/v1/questions/CHEM-U3-Q004/check",
        json={"student_id": "test-new-q", "submitted_answer": "0.25"},
    )
    assert response.json()["correct"] is True


def test_percentage_composition_question_correct_answer():
    response = client.post(
        "/api/v1/questions/CHEM-U3-Q005/check",
        json={"student_id": "test-new-q", "submitted_answer": "72.73"},
    )
    assert response.json()["correct"] is True


def test_isotope_neutrons_question_correct_answer():
    response = client.post(
        "/api/v1/questions/CHEM-U1-Q001/check",
        json={"student_id": "test-new-q", "submitted_answer": "20"},
    )
    assert response.json()["correct"] is True


def test_electron_configuration_question_correct_answer():
    response = client.post(
        "/api/v1/questions/CHEM-U1-Q002/check",
        json={"student_id": "test-new-q", "submitted_answer": "18"},
    )
    assert response.json()["correct"] is True


def test_electronegativity_question_correct_answer():
    response = client.post(
        "/api/v1/questions/CHEM-U2-Q001/check",
        json={"student_id": "test-new-q", "submitted_answer": "0.96"},
    )
    assert response.json()["correct"] is True


def test_lone_pairs_question_correct_answer():
    response = client.post(
        "/api/v1/questions/CHEM-U2-Q002/check",
        json={"student_id": "test-new-q", "submitted_answer": "2"},
    )
    assert response.json()["correct"] is True
