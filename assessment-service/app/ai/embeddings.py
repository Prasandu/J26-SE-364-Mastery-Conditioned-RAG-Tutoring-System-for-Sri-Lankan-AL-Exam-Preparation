"""Turning text into vectors for similarity search.

One provider for now: Gemini's gemini-embedding-001. Measured directly before being
used here (see docs/rag-resources.md): 3072 dimensions by default, truncatable to a
smaller size with output_dimensionality because the model is trained with Matryoshka
Representation Learning, which makes a requested smaller size a real reduced
embedding rather than a naive truncation. 768 was chosen for storage and retrieval
cost. The truncated output is not unit length, which does not matter here because
retrieval always compares by cosine distance, and cosine distance is scale-invariant.

Groq has no embedding endpoint, so this is deliberately not threaded through the same
OpenAI-compatible path the judge and author use.
"""

from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

from google import genai
from google.genai import types

from app.ai.tuning import RETRY_ATTEMPTS, RETRY_STATUS_CODES
from app.models import EMBEDDING_DIMENSIONS

# Measured at ~20 short passages per call in under 3 seconds (see docs/rag-resources.md).
# Kept comfortably under that so one slow network hop does not time out a whole batch.
MAX_BATCH = 16


@dataclass(frozen=True)
class EmbeddingResult:
    vectors: list[list[float] | None]  # same order as the input texts; None = failed
    model: str
    failures: list[str]  # one message per failed text, same length as the Nones


class EmbeddingModel(Protocol):
    name: str
    dimensions: int

    def embed(self, texts: list[str]) -> EmbeddingResult: ...


class GeminiEmbedding:
    def __init__(self, api_key: str, model: str, dimensions: int = EMBEDDING_DIMENSIONS) -> None:
        self.name = model
        self.dimensions = dimensions
        self._model = model
        self._client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(
                retry_options=types.HttpRetryOptions(
                    attempts=RETRY_ATTEMPTS,
                    initial_delay=2.0,
                    max_delay=30.0,
                    http_status_codes=RETRY_STATUS_CODES,
                )
            ),
        )

    def embed(self, texts: list[str]) -> EmbeddingResult:
        """Embed every text, batching under the provider's practical limit.

        One batch's failure (a quota error, a timeout) does not lose the batches
        around it: each batch is tried on its own, and a failed one leaves `None` in
        its places with the reason recorded, so the caller can see exactly what to
        retry rather than losing the whole run.
        """
        vectors: list[list[float] | None] = [None] * len(texts)
        failures: list[str] = []
        for start in range(0, len(texts), MAX_BATCH):
            batch = texts[start : start + MAX_BATCH]
            try:
                response = self._client.models.embed_content(
                    model=self._model,
                    contents=batch,
                    config=types.EmbedContentConfig(output_dimensionality=self.dimensions),
                )
            except Exception as error:  # noqa: BLE001 - any provider failure, none of it fatal to the run
                failures.append(f"texts {start}-{start + len(batch) - 1}: {error}")
                continue
            for offset, embedding in enumerate(response.embeddings):
                vectors[start + offset] = list(embedding.values)
        return EmbeddingResult(vectors, self.name, failures)


@lru_cache
def gemini_embedding(api_key: str, model: str, dimensions: int = EMBEDDING_DIMENSIONS) -> GeminiEmbedding:
    return GeminiEmbedding(api_key, model, dimensions)
