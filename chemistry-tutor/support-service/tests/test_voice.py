import io

from fastapi.testclient import TestClient

import app.api.voice as voice_module
from app.main import app

client = TestClient(app)


def test_transcribe_returns_text(monkeypatch):
    monkeypatch.setattr(
        voice_module, "transcribe_audio", lambda audio, language_hint=None: "mola kiyanne mokakda"
    )

    response = client.post(
        "/api/v1/voice/transcribe",
        files={"audio": ("test.wav", io.BytesIO(b"fake audio bytes"), "audio/wav")},
        data={"language": "si"},
    )

    assert response.status_code == 200
    assert response.json() == {"text": "mola kiyanne mokakda"}


def test_synthesize_returns_wav_audio(monkeypatch):
    monkeypatch.setattr(voice_module, "synthesize_sinhala_speech", lambda text: b"fake wav bytes")

    response = client.post("/api/v1/voice/synthesize", json={"text": "මොලයක් කියන්නේ මෝකක්ද?"})

    assert response.status_code == 200
    assert response.content == b"fake wav bytes"
    assert response.headers["content-type"] == "audio/wav"
