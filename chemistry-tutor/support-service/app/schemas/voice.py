from pydantic import BaseModel, Field

# A chat answer being read aloud is at most a few paragraphs; this bounds
# TTS synthesis time/cost per request, not legitimate use.
MAX_SYNTHESIZE_TEXT_LENGTH = 2000


class TranscribeResponse(BaseModel):
    text: str


class SynthesizeRequest(BaseModel):
    text: str = Field(max_length=MAX_SYNTHESIZE_TEXT_LENGTH)
