import io
from functools import lru_cache

# English TTS is already handled client-side by the browser's Web Speech
# API (works fine, zero cost/latency). This service exists only to unblock
# Sinhala: most browsers/OSes ship no Sinhala voice at all, which is a
# platform limitation no amount of frontend code can fix. Meta's MMS
# project publishes an open, local Sinhala TTS model, so we run it
# ourselves instead of depending on a browser voice or a paid cloud API.
MMS_SINHALA_MODEL = "tharushaudana/mms-tts-sinhala-custom-vocab-v2"


@lru_cache(maxsize=1)
def _get_model_and_tokenizer():
    from transformers import AutoTokenizer, VitsModel

    model = VitsModel.from_pretrained(MMS_SINHALA_MODEL)
    # This checkpoint's tokenizer_config.json has `"extra_special_tokens": []`
    # (a list), which newer transformers versions call `.keys()` on and
    # crash — it expects a dict. Overriding the kwarg explicitly skips
    # reading that broken field from the config file.
    tokenizer = AutoTokenizer.from_pretrained(MMS_SINHALA_MODEL, extra_special_tokens={})
    return model, tokenizer


def synthesize_sinhala_speech(text: str) -> bytes:
    """Synthesize Sinhala text to speech, returning a WAV file as bytes."""
    import scipy.io.wavfile
    import torch

    model, tokenizer = _get_model_and_tokenizer()

    inputs = tokenizer(text, return_tensors="pt")
    with torch.no_grad():
        waveform = model(**inputs).waveform[0].numpy()

    buffer = io.BytesIO()
    scipy.io.wavfile.write(buffer, rate=model.config.sampling_rate, data=waveform)
    return buffer.getvalue()
