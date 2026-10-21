from fastapi.testclient import TestClient

import app.api.tutor as tutor_module
from app.main import app

client = TestClient(app)


class FakeProvider:
    def generate_response(self, system_prompt: str, user_message: str) -> str:
        return f"fake answer to: {user_message}"


def test_ask_raw_returns_llm_answer(monkeypatch):
    monkeypatch.setattr(tutor_module, "get_llm_provider", lambda: FakeProvider())

    response = client.post("/api/v1/tutor/ask-raw", json={"question": "What is a mole?"})

    assert response.status_code == 200
    assert response.json() == {"answer": "fake answer to: What is a mole?"}
