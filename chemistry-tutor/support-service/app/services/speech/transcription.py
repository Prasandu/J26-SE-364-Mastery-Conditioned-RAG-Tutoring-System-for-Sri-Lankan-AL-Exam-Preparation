from functools import lru_cache
from typing import BinaryIO

from app.config import settings

# Groq's hosted Whisper models. "turbo" is distilled for speed, at some
# accuracy cost that's most noticeable on lower-resource languages — English
# is fine on turbo, but Sinhala accuracy was poor. Using full large-v3 (not
# turbo) for Sinhala specifically trades a little latency for meaningfully
# better accuracy; English keeps turbo since it was already working well.
WHISPER_MODEL_BY_LANGUAGE = {
    "en": "whisper-large-v3-turbo",
    "si": "whisper-large-v3",
}
DEFAULT_WHISPER_MODEL = "whisper-large-v3-turbo"

# Whisper's own language codes. "si" = Sinhala — supported by Groq's API.
SUPPORTED_LANGUAGES = {"en", "si"}

# A short domain-vocabulary hint biases Whisper's decoding toward the
# correct technical terms for this app's actual use case (Chemistry
# questions) instead of acoustically-similar but wrong everyday words —
# a standard Whisper accuracy technique, not just a language hint.
DOMAIN_PROMPT_BY_LANGUAGE = {
    "en": "Chemistry terms: mole, Avogadro constant, molarity, electron configuration, "
    "oxidation number, ionic bond, covalent bond, VSEPR, electronegativity, isotope.",
    "si": "රසායන විද්‍යා පදමාලාව: මෝලය, ඇවොගාඩ්‍රෝ නියතය, මෝලාරිටි, ඉලෙක්ට්‍රෝන විනයාසය, "
    "ඔක්සිකරණ සංඛ්‍යාව, අයනික බන්ධන, සහසංයුජ බන්ධන, විද්‍යුත් සෘණතාව, සමස්ථානික.",
}


@lru_cache(maxsize=1)
def _get_groq_client():
    from groq import Groq

    return Groq(api_key=settings.groq_api_key)


@lru_cache(maxsize=1)
def _get_gemini_client():
    from google import genai

    return genai.Client(api_key=settings.gemini_api_key)


GEMINI_MODEL = "gemini-3.8-flash"

GEMINI_TRANSCRIBE_PROMPT = (
    "Transcribe this audio exactly as spoken, in Sinhala script. This is a Sri Lankan "
    "G.C.E. Advanced Level student asking a Chemistry question, so expect Chemistry "
    "vocabulary (e.g. මෝලය, ඇවොගාඩ්‍රෝ නියතය, ඔක්සිකරණ සංඛ්‍යාව, අයනික බන්ධන, සහසංයුජ බන්ධන). "
    "Output ONLY the transcription, nothing else — no translation, no explanation."
)


def _transcribe_with_groq(audio_bytes: bytes, language: str | None) -> str:
    model = WHISPER_MODEL_BY_LANGUAGE.get(language, DEFAULT_WHISPER_MODEL)
    prompt = DOMAIN_PROMPT_BY_LANGUAGE.get(language, DOMAIN_PROMPT_BY_LANGUAGE["en"])
    kwargs = {"language": language} if language else {}

    result = _get_groq_client().audio.transcriptions.create(
        file=("audio.webm", audio_bytes),
        model=model,
        response_format="text",
        prompt=prompt,
        **kwargs,
    )
    # response_format="text" returns a plain string directly; some SDK
    # versions still wrap it, so handle both defensively.
    return result if isinstance(result, str) else getattr(result, "text", str(result))


def _transcribe_sinhala_with_gemini(audio_bytes: bytes) -> str:
    """Sinhala-only path: Groq's hosted Whisper models are weaker on
    lower-resource languages like Sinhala (a known Whisper limitation, not
    specific to this app). Google's models have broader South Asian
    language coverage, so this is tried as a dedicated Sinhala transcriber
    while English stays on Groq Whisper (already working well there).
    """
    from google.genai import types

    response = _get_gemini_client().models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            GEMINI_TRANSCRIBE_PROMPT,
            types.Part.from_bytes(data=audio_bytes, mime_type="audio/webm"),
        ],
    )
    return response.text or ""


def transcribe_audio(audio: str | BinaryIO, language_hint: str | None = None) -> str:
    language = language_hint if language_hint in SUPPORTED_LANGUAGES else None

    if isinstance(audio, str):
        with open(audio, "rb") as f:
            audio_bytes = f.read()
    else:
        audio_bytes = audio.read()

    if language == "si" and settings.gemini_api_key:
        text = _transcribe_sinhala_with_gemini(audio_bytes)
    else:
        text = _transcribe_with_groq(audio_bytes, language)

    return text.strip()
