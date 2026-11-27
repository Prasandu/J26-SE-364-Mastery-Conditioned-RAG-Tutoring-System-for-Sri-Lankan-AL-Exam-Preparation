import io

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile

from app.auth import get_current_user_id
from app.rate_limit import limiter
from app.schemas.voice import SynthesizeRequest, TranscribeResponse
from app.services.speech.synthesis import synthesize_sinhala_speech
from app.services.speech.transcription import transcribe_audio

router = APIRouter()

# A single spoken question clip is at most a couple of minutes; 15 MB is
# generous headroom (even uncompressed WAV) while still rejecting absurdly
# large uploads before they're read fully into memory or sent to the
# transcription model.
MAX_AUDIO_BYTES = 15 * 1024 * 1024


# Both routes call paid speech providers: signed-in callers only, checked before the
# upload or text reaches a provider.
@router.post(
    "/voice/transcribe", response_model=TranscribeResponse, dependencies=[Depends(get_current_user_id)]
)
@limiter.limit("10/minute")
async def transcribe(
    request: Request, audio: UploadFile = File(...), language: str | None = Form(None)
) -> TranscribeResponse:
    """Transcribe a recorded audio clip to text. No raw audio is saved to
    disk or the database — it's read into memory, transcribed, and discarded.
    """
    audio_bytes = await audio.read()
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio clip too large (max 15 MB).")
    text = transcribe_audio(io.BytesIO(audio_bytes), language_hint=language)
    return TranscribeResponse(text=text)


@router.post("/voice/synthesize", dependencies=[Depends(get_current_user_id)])
@limiter.limit("10/minute")
def synthesize(request: Request, body: SynthesizeRequest) -> Response:
    """Synthesize Sinhala text to speech (WAV). English is handled entirely
    client-side via the browser's Web Speech API, which already has usable
    English voices everywhere — this endpoint exists only because browsers
    generally ship no Sinhala voice at all.
    """
    audio_bytes = synthesize_sinhala_speech(body.text)
    return Response(content=audio_bytes, media_type="audio/wav")
