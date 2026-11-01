"""Embedding provider tests. The real model is never downloaded or loaded here."""

import math
import sys

import pytest

from app.rag.embeddings import (
    EMBEDDING_DIMENSION,
    E5LocalProvider,
    EmbeddingDimensionError,
    EmbeddingError,
    FakeEmbeddingProvider,
    build_embedding_provider,
    checked_unit_vector,
)


def test_fake_vectors_are_384_dimensional_and_unit_length() -> None:
    provider = FakeEmbeddingProvider()
    [q] = provider.embed_queries(["How many grams of Na₂CO₃ are weighed?"])
    [p] = provider.embed_passages(["Weigh 26.5 g of Na₂CO₃."])
    for v in (q, p):
        assert len(v) == EMBEDDING_DIMENSION
        assert math.isclose(math.sqrt(sum(x * x for x in v)), 1.0, rel_tol=1e-9)


def test_prefixes_are_applied_for_every_language() -> None:
    provider = FakeEmbeddingProvider()
    provider.embed_queries(["Why use a funnel?", "පුනීලයක් භාවිතා කරන්නේ ඇයි?"])
    provider.embed_passages(["Use a funnel."])
    assert provider.inputs == [
        "query: Why use a funnel?",
        "query: පුනීලයක් භාවිතා කරන්නේ ඇයි?",
        "passage: Use a funnel.",
    ]


def test_fake_is_deterministic() -> None:
    a = FakeEmbeddingProvider().embed_queries(["volumetric flask"])
    b = FakeEmbeddingProvider().embed_queries(["volumetric flask"])
    assert a == b


def test_dimension_mismatch_is_rejected() -> None:
    with pytest.raises(EmbeddingDimensionError):
        checked_unit_vector([1.0] * 768)
    with pytest.raises(EmbeddingDimensionError):
        FakeEmbeddingProvider(dimension=128).embed_queries(["x"])
    with pytest.raises(EmbeddingError):
        checked_unit_vector([0.0] * EMBEDDING_DIMENSION)


def test_e5_provider_is_lazy() -> None:
    provider = E5LocalProvider("intfloat/multilingual-e5-small")
    assert provider.model_id == "intfloat/multilingual-e5-small" and provider.dimension == 384
    assert provider._model is None  # nothing loaded at construction
    assert "sentence_transformers" not in sys.modules


def test_provider_factory() -> None:
    assert isinstance(build_embedding_provider("fake", "m", None), FakeEmbeddingProvider)
    assert isinstance(build_embedding_provider("e5_local", "m", None), E5LocalProvider)
    assert build_embedding_provider("disabled", "m", None) is None


class _StubTokenizer:
    def __call__(self, text: str, **_: object) -> dict[str, list[int]]:
        return {"input_ids": [0] * (len(text.split()) + 2)}


class _StubModel:
    tokenizer = _StubTokenizer()
    encoded: list[list[str]] = []

    def encode(self, texts: list[str], **_: object) -> list[list[float]]:
        self.encoded.append(texts)
        return [[1.0] + [0.0] * (EMBEDDING_DIMENSION - 1) for _ in texts]


def test_e5_token_limit_is_checked_before_embedding() -> None:
    from app.rag.embeddings import TokenLimitError

    provider = E5LocalProvider("intfloat/multilingual-e5-small")
    stub = _StubModel()
    provider._model, provider._revision = stub, "stub-revision"
    [v] = provider.embed_queries(["short question"])
    assert len(v) == EMBEDDING_DIMENSION and stub.encoded == [["query: short question"]]
    with pytest.raises(TokenLimitError):
        provider.embed_passages(["word " * 511])
    assert len(stub.encoded) == 1  # the oversized input never reached the model
