"""Map OpenAI-SDK exceptions (used for OpenAI and Groq) to safe, typed generation failures.

Only the technical category and Retry-After survive; provider bodies, messages and request
headers are dropped so they can never reach logs or clients.
"""

import openai

from app.rag.generation import (
    GenerationFailure,
    GenerationRateLimited,
    GenerationTimeout,
    GenerationUnavailable,
)

#: Provider error codes that mean the configured model no longer exists or is unavailable.
_MODEL_UNAVAILABLE_CODES = frozenset(
    {"model_not_found", "model_decommissioned", "model_deprecated", "model_not_available"}
)
_QUOTA_CODES = frozenset({"insufficient_quota", "billing_hard_limit_reached", "quota_exceeded"})


def retry_after_seconds(exc: Exception) -> float | None:
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if headers is None:
        return None
    for name, scale in (("retry-after-ms", 0.001), ("retry-after", 1.0)):
        raw = headers.get(name)
        if raw is None:
            continue
        try:
            value = float(raw) * scale
        except (TypeError, ValueError):
            continue
        if 0 <= value <= 24 * 3600:
            return value
    return None


def _provider_error_code(exc: Exception) -> str | None:
    """Read only the structured provider error code; never retain provider text."""
    code = getattr(exc, "code", None)
    if isinstance(code, str):
        return code.casefold()
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict):
            code = error.get("code") or error.get("type")
            if isinstance(code, str):
                return code.casefold()
    return None


def classify(exc: Exception) -> GenerationFailure:
    """A typed failure whose `kind` decides whether failover may continue (FALLBACK_KINDS)."""
    if isinstance(exc, openai.APITimeoutError):
        return GenerationTimeout("provider timed out")
    if isinstance(exc, openai.APIConnectionError):
        # Connection refused/reset, or the transport ended without a response.
        return GenerationUnavailable("provider connection failed", kind="connection")
    if isinstance(exc, openai.RateLimitError):
        if _provider_error_code(exc) in _QUOTA_CODES:
            return GenerationUnavailable("provider quota exhausted", kind="quota_exhausted")
        return GenerationRateLimited("provider rate limit", retry_after=retry_after_seconds(exc))
    code = getattr(exc, "code", None)
    if isinstance(exc, openai.NotFoundError) or code in _MODEL_UNAVAILABLE_CODES:
        return GenerationUnavailable("configured model is unavailable", kind="model_unavailable")
    if isinstance(exc, openai.AuthenticationError | openai.PermissionDeniedError):
        return GenerationUnavailable("provider credentials or permissions rejected", kind="auth")
    if isinstance(exc, openai.BadRequestError | openai.UnprocessableEntityError):
        return GenerationUnavailable("provider rejected the request", kind="bad_request")
    if isinstance(exc, openai.InternalServerError):
        return GenerationUnavailable(
            "provider unavailable", kind="server_error", retry_after=retry_after_seconds(exc)
        )
    if isinstance(exc, openai.APIStatusError) and getattr(exc, "status_code", 0) >= 500:
        return GenerationUnavailable("provider unavailable", kind="server_error")
    return GenerationUnavailable("provider error", kind="other")
