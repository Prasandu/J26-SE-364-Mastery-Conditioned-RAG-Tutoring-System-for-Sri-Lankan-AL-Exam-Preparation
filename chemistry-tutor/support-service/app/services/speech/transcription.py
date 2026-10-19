from functools import lru_cache
from typing import BinaryIO

# "small" gave poor Sinhala accuracy in manual testing (English was fine).
# Tried "large-v3" (~3GB single weights file) but its download stalled
# repeatedly on this network, even with hf_xet. "medium" (~1.5GB) is a
# middle ground: meaningfully better Sinhala than "small", smaller/more
# reliable download than large-v3.
WHISPER_MODEL_SIZE = "medium"

# Whisper's own language codes. "si" = Sinhala.
SUPPORTED_LANGUAGES = {"en", "si"}


def _patch_av_open_for_faster_whisper() -> None:
    """faster-whisper calls av.open(..., metadata_errors="ignore"), a
    parameter that newer PyAV (19.x) removed. There's no prebuilt PyAV
    wheel for this Python/Windows combo below 19.x, and building one needs
    a C++ compiler we don't have, so patch the call instead of pinning an
    older av.
    """
    import av

    if getattr(av.open, "_patched_for_faster_whisper", False):
        return

    original_open = av.open

    def patched_open(*args, **kwargs):
        kwargs.pop("metadata_errors", None)
        return original_open(*args, **kwargs)

    patched_open._patched_for_faster_whisper = True
    av.open = patched_open


@lru_cache(maxsize=1)
def _get_model():
    _patch_av_open_for_faster_whisper()
    from faster_whisper import WhisperModel

    return WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")


def transcribe_audio(audio: str | BinaryIO, language_hint: str | None = None) -> str:
    model = _get_model()
    language = language_hint if language_hint in SUPPORTED_LANGUAGES else None

    segments, _info = model.transcribe(audio, language=language)
    return " ".join(segment.text.strip() for segment in segments).strip()
