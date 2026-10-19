import io

from fastapi import APIRouter, File, Form, UploadFile

from app.schemas.voice import TranscribeResponse
from app.services.speech.transcription import transcribe_audio

router = APIRouter()


@router.post("/voice/transcribe", response_model=TranscribeResponse)
async def transcribe(audio: UploadFile = File(...), language: str | None = Form(None)) -> TranscribeResponse:
    """Transcribe a recorded audio clip to text. No raw audio is saved to
    disk or the database — it's read into memory, transcribed, and discarded.
    """
    audio_bytes = await audio.read()
    text = transcribe_audio(io.BytesIO(audio_bytes), language_hint=language)
    return TranscribeResponse(text=text)
