"""POST /assistant/ask use case.

The server decides everything that reaches the provider: the owner-checked session supplies only a
safe state summary (experiment, mode, completed or not, never measurements, errors or scores), the
knowledge base supplies the evidence, and the prompt version and provider are configuration. The
client sends only {sessionId, question, locale}.
"""

import asyncio
import hashlib
import json
import logging
import re
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

from starlette.concurrency import run_in_threadpool

from app.errors import ApiError, correlation_id_var
from app.knowledge.models import KnowledgeChunk
from app.language import text_locale
from app.rag.embeddings import EmbeddingError
from app.rag.generation import (
    PROMPT_VERSION,
    AnswerCache,
    Evidence,
    GenerationInvalid,
    GenerationMeta,
    GenerationProvider,
    GenerationRateLimited,
    GenerationRequest,
    GenerationTimeout,
    GenerationUnavailable,
    generate_validated,
    looks_like_injection,
)
from app.rag.repository import KnowledgeUnavailable
from app.rag.retrieval import Retriever, normalize_question
from app.rag.topics import focus_evidence
from app.repositories import SessionRecord

if TYPE_CHECKING:
    from app.knowledge_runtime import KnowledgeRuntime
    from app.rag.translate import Translator
    from app.settings import Settings

logger = logging.getLogger("vlab.assistant")


@dataclass(frozen=True)
class SafeState:
    experiment_id: str
    definition_version: str
    mode: str
    completed: bool

    @staticmethod
    def of(session: SessionRecord) -> "SafeState":
        return SafeState(
            session.experiment_id,
            session.definition_version,
            session.mode,
            session.status == "submitted",
        )

    def public(self) -> dict[str, Any]:
        """The only session information a provider may see (no seed, events or measurements)."""
        return {
            "experimentId": self.experiment_id,
            "mode": self.mode,
            "submitted": self.completed,
        }

    def fingerprint(self) -> str:
        canonical = json.dumps(self.__dict__, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def _year(edition: str) -> int | None:
    match = re.search(r"\b(19|20)\d{2}\b", edition)
    return int(match.group(0)) if match else None


def citation(chunk: KnowledgeChunk) -> dict[str, Any]:
    """Safe public projection: bibliographic metadata only, never chunk text."""
    return {
        "chunkId": chunk.chunk_id,
        "documentTitle": chunk.document_title,
        "year": _year(chunk.edition),
        "pdfPage": chunk.pdf_page,
        "printedPage": chunk.printed_page,
        "section": chunk.section,
        "heading": chunk.heading,
    }


def load_refusals(content_dir: Path) -> dict[str, dict[str, str]]:
    """Localised refusal messages from the shared UI locale files (single source of truth)."""
    out: dict[str, dict[str, str]] = {}
    for locale in ("en", "si"):
        strings = json.loads(
            (content_dir / "locales" / locale / "ui.json").read_text(encoding="utf-8")
        )
        out[locale] = {
            reason: strings[f"assistant.refusal.{reason}"]
            for reason in ("insufficient_evidence", "out_of_scope", "unsafe_request")
        }
    return out


class AssistantService:
    def __init__(
        self,
        retriever: Retriever | None,
        provider: GenerationProvider,
        refusals: dict[str, dict[str, str]],
        *,
        timeout_seconds: float = 20.0,
        cache: AnswerCache | None = None,
        translator: "Translator | None" = None,
    ) -> None:
        self._retriever = retriever
        self._provider = provider
        self._refusals = refusals
        self._timeout = timeout_seconds
        self._cache = cache or AnswerCache()
        self._translator = translator
        self.last_cache_key: str | None = None

    @property
    def cache(self) -> AnswerCache:
        return self._cache

    @property
    def provider(self) -> GenerationProvider:
        return self._provider

    @property
    def translator(self) -> "Translator | None":
        return self._translator

    def _refused(self, reason: str, locale: str, knowledge_version: str) -> dict[str, Any]:
        return {
            "status": "refused",
            "answer": self._refusals[locale][reason],
            "locale": locale,
            "evidenceSufficient": False,
            "refusalReason": reason,
            "citations": [],
            "aiAssistanceLabel": locale == "si",
            "knowledgeVersion": knowledge_version,
        }

    def _log(self, status: str, category: str | None, meta: GenerationMeta | None = None) -> None:
        """Metadata only: never the question, answer, evidence, notebook, keys or session state."""
        logger.info(
            "assistant correlation_id=%s provider=%s model=%s status=%s category=%s"
            " attempted=%s actual_provider=%s fallback_used=%s failure_category=%s"
            " latency_ms=%s input_tokens=%s output_tokens=%s reasoning_tokens=%s",
            correlation_id_var.get(),
            self._provider.name,
            self._provider.model,
            status,
            category,
            ",".join(meta.attempted) if meta and meta.attempted else None,
            meta.provider if meta else None,
            meta.fallback_used if meta else None,
            meta.failure_category if meta else None,
            meta.latency_ms if meta else None,
            meta.input_tokens if meta else None,
            meta.output_tokens if meta else None,
            meta.reasoning_tokens if meta else None,
        )

    async def ask(self, session: SessionRecord, question: str, locale: str) -> dict[str, Any]:
        locale = text_locale(question, locale)
        if self._provider.name == "disabled":
            raise ApiError(
                503, "assistant_unavailable", "The assistant is not configured", retryable=False
            )
        if self._retriever is None:
            raise ApiError(503, "knowledge_unavailable", "The knowledge base is not available")
        state = SafeState.of(session)
        fingerprint = state.fingerprint()
        envelope = {"sequence": session.next_sequence, "stateFingerprint": fingerprint}

        def finish(body: dict[str, Any], cached: bool) -> dict[str, Any]:
            return {**body, **envelope, "cached": cached}

        try:
            active = await run_in_threadpool(self._retriever.active_version)
            retrieval_config = await run_in_threadpool(self._retriever.config_id)
        except (KnowledgeUnavailable, EmbeddingError) as exc:
            raise ApiError(
                503, "knowledge_unavailable", "The knowledge base is not available"
            ) from exc

        if looks_like_injection(question):
            self._log("refused", "injection_screen")
            return finish(self._refused("unsafe_request", locale, active), False)

        key = AnswerCache.key(
            normalized_question=normalize_question(question),
            locale=locale,
            knowledge_version=active,
            state_fingerprint=fingerprint,
            prompt_version=PROMPT_VERSION,
            provider=self._provider.name,
            model=self._provider.model,
            retrieval_config=retrieval_config,
            routing_policy=getattr(self._provider, "routing_policy", "direct"),
        )
        self.last_cache_key = key
        hit = self._cache.get(key)
        if hit is not None:
            self._log("cached", None)
            return finish(hit, True)

        retrieval_question = question
        if locale == "si" and self._translator is not None:
            translated = await run_in_threadpool(self._translator.to_english, question)
            if translated:
                retrieval_question = translated
        try:
            retrieval = await run_in_threadpool(self._retriever.retrieve, retrieval_question)
        except (KnowledgeUnavailable, EmbeddingError) as exc:
            logger.warning("knowledge unavailable: %s", type(exc).__name__)
            raise ApiError(
                503, "knowledge_unavailable", "The knowledge base is not available"
            ) from exc

        evidence = tuple(
            Evidence(c.chunk.chunk_id, c.chunk.heading, focus_evidence(question, c.chunk.text))
            for c in retrieval.evidence
        )
        if not evidence:
            body = self._refused("insufficient_evidence", locale, retrieval.knowledge_version)
            self._cache.put(key, body)
            self._log("refused", "no_evidence")
            return finish(body, False)

        request = GenerationRequest(
            question=question, locale=locale, evidence=evidence, session=state.public()
        )
        # Set on client cancellation or deadline: a router then starts no further provider.
        cancel = threading.Event()
        try:
            outcome = await asyncio.wait_for(
                run_in_threadpool(generate_validated, self._provider, request, cancel),
                self._timeout,
            )
        except asyncio.CancelledError:
            cancel.set()
            self._log("cancelled", "client_cancelled")
            raise
        except (TimeoutError, GenerationTimeout) as exc:
            cancel.set()
            self._log("error", "timeout")
            raise ApiError(
                504, "assistant_timeout", "The assistant timed out", retryable=True
            ) from exc
        except GenerationRateLimited as exc:
            self._log("error", "rate_limited")
            raise ApiError(
                429, "assistant_rate_limited", "The assistant is busy; try again", retryable=True
            ) from exc
        except GenerationUnavailable as exc:
            self._log("error", exc.kind)
            raise ApiError(
                503, "assistant_unavailable", "The assistant is unavailable", retryable=True
            ) from exc
        except GenerationInvalid as exc:
            self._log("error", "invalid_response")
            raise ApiError(
                502, "assistant_invalid_response", "The assistant returned an invalid response"
            ) from exc

        verdict = outcome.verdict
        if not verdict.grounded:
            # Failed post-validation is refused (the established safe equivalent of a 502): the
            # model text is never shown. A model refusal is not deterministic: an explicit
            # resubmission must be able to try again rather than reusing it indefinitely.
            self._log("refused", verdict.category, outcome.meta)
            body = self._refused("insufficient_evidence", locale, retrieval.knowledge_version)
            if verdict.category in CACHEABLE_REFUSALS:
                self._cache.put(key, body, _generated_by(outcome.meta))
            return finish(body, False)

        chunks = {c.chunk.chunk_id: c.chunk for c in retrieval.evidence}
        body = {
            "status": "grounded",
            "answer": outcome.output.answer.strip(),
            "locale": locale,
            "evidenceSufficient": True,
            "refusalReason": None,
            "citations": [citation(chunks[cid]) for cid in verdict.cited_chunk_ids],
            "aiAssistanceLabel": locale == "si",
            "knowledgeVersion": retrieval.knowledge_version,
        }
        self._cache.put(key, body, _generated_by(outcome.meta))
        self._log("grounded", None, outcome.meta)
        return finish(body, False)


def _generated_by(meta: GenerationMeta) -> dict[str, str]:
    """Which provider and model actually produced the validated result (audit metadata)."""
    return {
        "provider": meta.provider,
        "model": meta.model,
        "modelReturned": meta.model_returned or "",
        "fallbackUsed": str(meta.fallback_used).lower(),
    }


#: Refusals that do not depend on a malformed or unsupported model output.
CACHEABLE_REFUSALS = frozenset({"unsupported_entity_in_question"})


def build_assistant(
    settings: "Settings", knowledge: "KnowledgeRuntime | None" = None
) -> AssistantService:
    """Wire the configured providers. Missing private knowledge data degrades to 503.

    The knowledge runtime (repository + embeddings) is shared with the admin knowledge feed, so
    activating a new knowledge version changes what the assistant retrieves immediately.
    """
    from app.knowledge_runtime import build_knowledge_runtime
    from app.rag.providers import build_configured_provider, service_timeout
    from app.rag.translate import build_query_translator

    runtime = knowledge or build_knowledge_runtime(settings)
    retriever: Retriever | None = None
    if runtime.repository is not None and runtime.embeddings is not None:
        retriever = Retriever(runtime.repository, runtime.embeddings)
    return AssistantService(
        retriever,
        build_configured_provider(settings),
        load_refusals(settings.content_dir),
        timeout_seconds=service_timeout(settings),
        translator=build_query_translator(settings),
    )
