"""Embedding providers: deterministic fake (tests) and local multilingual-e5-small.

E5 requires the exact prefixes "query: " and "passage: " (for every language). Vectors are
L2-normalised and must be exactly 384-dimensional; nothing is ever padded or truncated, and any
input over the 512-token limit is rejected before embedding.
"""

import hashlib
import math
import re
import threading
from collections.abc import Sequence
from pathlib import Path
from typing import Any, Protocol

EMBEDDING_DIMENSION = 384
MODEL_MAX_TOKENS = 512
QUERY_PREFIX = "query: "
PASSAGE_PREFIX = "passage: "

Vector = tuple[float, ...]


class EmbeddingError(RuntimeError):
    pass


class EmbeddingDimensionError(EmbeddingError):
    pass


class TokenLimitError(EmbeddingError):
    pass


class EmbeddingProvider(Protocol):
    @property
    def model_id(self) -> str: ...
    @property
    def revision(self) -> str: ...
    @property
    def dimension(self) -> int: ...
    def count_tokens(self, text: str) -> int: ...
    def embed_queries(self, texts: Sequence[str]) -> list[Vector]: ...
    def embed_passages(self, texts: Sequence[str]) -> list[Vector]: ...


def checked_unit_vector(values: Sequence[float], expected: int = EMBEDDING_DIMENSION) -> Vector:
    if len(values) != expected:
        raise EmbeddingDimensionError(f"expected {expected} dimensions, got {len(values)}")
    norm = math.sqrt(sum(v * v for v in values))
    if norm == 0 or not math.isfinite(norm):
        raise EmbeddingError("embedding has no direction")
    return tuple(v / norm for v in values)


_TOKEN = re.compile(r"[\w₀-₉⁰-⁹⁻]+", re.UNICODE)


class FakeEmbeddingProvider:
    """Deterministic hashed bag-of-words. Records every input so tests can assert prefixes."""

    model_id = "fake/hashed-bow"
    revision = "fake-1"
    dimension = EMBEDDING_DIMENSION

    def __init__(self, dimension: int = EMBEDDING_DIMENSION) -> None:
        self._dimension = dimension
        self.inputs: list[str] = []

    def count_tokens(self, text: str) -> int:
        return math.ceil(len(_TOKEN.findall(text)) * 1.6) + 2

    def _embed(self, text: str) -> Vector:
        self.inputs.append(text)
        values = [0.0] * self._dimension
        for token in _TOKEN.findall(text.casefold()):
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % self._dimension
            values[index] += 1.0 if digest[4] % 2 else -1.0
        if not any(values):
            values[0] = 1.0
        return checked_unit_vector(values, EMBEDDING_DIMENSION)

    def embed_queries(self, texts: Sequence[str]) -> list[Vector]:
        return [self._embed(QUERY_PREFIX + t) for t in texts]

    def embed_passages(self, texts: Sequence[str]) -> list[Vector]:
        return [self._embed(PASSAGE_PREFIX + t) for t in texts]


class E5LocalProvider:
    """intfloat/multilingual-e5-small via sentence-transformers, loaded once on first use."""

    def __init__(
        self, model_id: str, revision: str | None = None, cache_dir: Path | None = None
    ) -> None:
        self._model_id = model_id
        self._requested_revision = revision
        self._cache_dir = cache_dir
        self._model: Any = None
        self._revision: str | None = None
        self._lock = threading.Lock()

    @property
    def model_id(self) -> str:
        return self._model_id

    @property
    def revision(self) -> str:
        self._load()
        assert self._revision is not None
        return self._revision

    @property
    def dimension(self) -> int:
        return EMBEDDING_DIMENSION

    def _load(self) -> Any:
        with self._lock:
            if self._model is None:
                from huggingface_hub import snapshot_download  # rag dependency group
                from sentence_transformers import SentenceTransformer

                path = Path(
                    snapshot_download(
                        self._model_id,
                        revision=self._requested_revision,
                        cache_dir=str(self._cache_dir) if self._cache_dir else None,
                    )
                )
                model = SentenceTransformer(str(path), device="cpu")
                if model.get_sentence_embedding_dimension() != EMBEDDING_DIMENSION:
                    raise EmbeddingDimensionError(
                        "model does not produce 384-dimensional embeddings"
                    )
                model.max_seq_length = MODEL_MAX_TOKENS
                self._revision = path.name  # Hugging Face snapshot = commit hash
                self._model = model
            return self._model

    def count_tokens(self, text: str) -> int:
        tokenizer = self._load().tokenizer
        return len(tokenizer(text, add_special_tokens=True, truncation=False)["input_ids"])

    def _encode(self, texts: list[str]) -> list[Vector]:
        for text in texts:
            if self.count_tokens(text) > MODEL_MAX_TOKENS:
                raise TokenLimitError("input exceeds the 512-token model limit")
        matrix = self._load().encode(texts, normalize_embeddings=True, convert_to_numpy=True)
        return [checked_unit_vector([float(x) for x in row]) for row in matrix]

    def embed_queries(self, texts: Sequence[str]) -> list[Vector]:
        return self._encode([QUERY_PREFIX + t for t in texts])

    def embed_passages(self, texts: Sequence[str]) -> list[Vector]:
        return self._encode([PASSAGE_PREFIX + t for t in texts])


def build_embedding_provider(
    kind: str, model_id: str, revision: str | None
) -> EmbeddingProvider | None:
    if kind == "fake":
        return FakeEmbeddingProvider()
    if kind == "e5_local":
        return E5LocalProvider(model_id, revision)
    return None
