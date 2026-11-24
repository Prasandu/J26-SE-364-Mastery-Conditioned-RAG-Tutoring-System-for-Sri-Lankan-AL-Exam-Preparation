from functools import lru_cache

EMBEDDING_MODEL_NAME = "BAAI/bge-m3"


@lru_cache(maxsize=1)
def _get_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(EMBEDDING_MODEL_NAME)


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    vectors = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return [v.tolist() for v in vectors]


def warm_up() -> None:
    """Load the model now instead of on the first real request — called
    once at app startup so the first user doesn't eat a multi-second model
    load on top of the usual retrieval latency.
    """
    _get_model()
