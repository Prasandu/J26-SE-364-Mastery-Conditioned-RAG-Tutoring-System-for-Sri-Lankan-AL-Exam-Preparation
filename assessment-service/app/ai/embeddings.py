"""Turning text into vectors for similarity search.

Local, not an API call: BAAI/bge-m3, run on this machine's CPU via
sentence-transformers. Chosen over an embedding API for retrieval quality (BGE-M3 is
a strong multilingual retrieval model), no daily quota to run out of, and working
offline - the cost is a model (~2GB on disk) loaded into memory once per process, and
CPU time per batch instead of a network round trip.

The model's own dense output is a fixed 1024 dimensions - unlike Gemini's embedding
model, BGE-M3 was not trained with Matryoshka Representation Learning, so there is no
equivalent of truncating to a smaller size; EMBEDDING_DIMENSIONS exists to size the
database column, not to configure the model.
"""

from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

from app.models import EMBEDDING_DIMENSIONS

# CPU batches with no network round trip to amortise - this only bounds how much goes
# through the model at once, so memory use stays predictable on a laptop.
MAX_BATCH = 32


@dataclass(frozen=True)
class EmbeddingResult:
    vectors: list[list[float] | None]  # same order as the input texts; None = failed
    model: str
    failures: list[str]  # one message per failed text, same length as the Nones


class EmbeddingModel(Protocol):
    name: str
    dimensions: int

    def embed(self, texts: list[str]) -> EmbeddingResult: ...


class LocalEmbedding:
    """BAAI/bge-m3, loaded once and reused for every batch after that.

    Building a SentenceTransformer re-reads the model's weights, so this happens once
    in __init__, not per call - local_embedding() below caches the instance for
    exactly that reason.
    """

    def __init__(self, model_name: str = "BAAI/bge-m3") -> None:
        from sentence_transformers import SentenceTransformer  # heavy import, deferred until actually used

        self.name = model_name
        self.dimensions = EMBEDDING_DIMENSIONS
        self._model = SentenceTransformer(model_name)

    def embed(self, texts: list[str]) -> EmbeddingResult:
        """Embed every text in one batched call.

        A local model does not fail per-batch the way a rate-limited API does - if it
        fails at all (out of memory, a bad input), it fails for everything asked of it
        this call, so there is one failure message for the whole list rather than
        per-batch ones.
        """
        if not texts:
            return EmbeddingResult([], self.name, [])
        try:
            vectors = self._model.encode(
                texts,
                batch_size=MAX_BATCH,
                normalize_embeddings=True,  # cosine distance expects this; BGE-M3's own convention
                show_progress_bar=False,
            )
        except Exception as error:  # noqa: BLE001 - any local failure, none of it fatal to the caller's run
            return EmbeddingResult([None] * len(texts), self.name, [f"texts 0-{len(texts) - 1}: {error}"])
        return EmbeddingResult([[float(x) for x in vector] for vector in vectors], self.name, [])


@lru_cache
def local_embedding(model_name: str) -> LocalEmbedding:
    return LocalEmbedding(model_name)
