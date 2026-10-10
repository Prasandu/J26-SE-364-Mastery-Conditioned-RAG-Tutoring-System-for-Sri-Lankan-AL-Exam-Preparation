"""Failover routing between generation providers (default order: Groq, then OpenAI).

Rules (DECISIONS D30):
* Each provider is attempted at most once per request, in configured order; never revisited.
* Only technical failures move on (FALLBACK_KINDS: 429, connection failure / transport ended
  without a response, timeout, 5xx, unavailable or deprecated model). A valid answer, any refusal,
  a schema failure or a post-validation failure is final: an ungrounded response is refused and is
  never sent to another provider for a more permissive answer. 400/422/401/403 never move on.
* A process-local circuit breaker protects the primary: a 429 or temporary failure opens it for
  Retry-After (or the configured cooldown); while open, requests go straight to the fallback; after
  the cooldown one probe is allowed; a validated primary response closes it.
* Paid fallback calls are limited per UTC day (in memory). When exhausted, no paid call is made.
* Deadlines: primary 12 s, fallback 18 s, total 30 s; the fallback only gets the remaining time.
  A cancellation (client gone or deadline hit) stops the request before any further provider.

Process-local state only (M1): a multi-process or distributed deployment needs shared circuit
and budget state (e.g. a database or cache) - not required for one API process.
"""

import dataclasses
import logging
import threading
import time
from collections.abc import Callable, Sequence
from datetime import UTC, date, datetime
from typing import Any

from app.rag.generation import (
    GenerationFailure,
    GenerationInvalid,
    GenerationProvider,
    GenerationRequest,
    GenerationResult,
    GenerationTimeout,
    GenerationUnavailable,
    Outcome,
    validate_result,
)

ROUTING_POLICY_VERSION = "failover-1.0.0"
#: Failures that indicate a temporarily unhealthy primary (open the circuit).
CIRCUIT_KINDS = frozenset(
    {"rate_limited", "connection", "timeout", "server_error", "no_response", "model_unavailable"}
)
#: Providers whose use as a fallback costs money and counts against the daily limit.
PAID_PROVIDERS = frozenset({"openai"})
_MIN_CALL_SECONDS = 0.5

logger = logging.getLogger("vlab.assistant")


class CircuitBreaker:
    """closed -> open (for retry_after or cooldown) -> half_open (one probe) -> closed/open."""

    def __init__(
        self, cooldown_seconds: float, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._cooldown = cooldown_seconds
        self._clock = clock
        self._state = "closed"
        self._open_until = 0.0
        self._probing = False
        self._lock = threading.Lock()

    def _refresh(self) -> None:
        if self._state == "open" and self._clock() >= self._open_until:
            self._state, self._probing = "half_open", False

    @property
    def state(self) -> str:
        with self._lock:
            self._refresh()
            return self._state

    def allow(self) -> bool:
        with self._lock:
            self._refresh()
            if self._state == "closed":
                return True
            if self._state == "open" or self._probing:
                return False
            self._probing = True  # the single half-open probe
            return True

    def record_success(self) -> None:
        with self._lock:
            self._state, self._probing = "closed", False

    def record_failure(self, retry_after: float | None) -> None:
        with self._lock:
            delay = retry_after if retry_after is not None else self._cooldown
            self._state, self._probing = "open", False
            self._open_until = self._clock() + max(0.0, delay)

    def release_probe(self) -> None:
        """A non-health outcome (e.g. auth or schema error) ends a probe without a verdict."""
        with self._lock:
            self._probing = False

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            self._refresh()
            remaining = max(0.0, self._open_until - self._clock()) if self._state == "open" else 0
            return {"state": self._state, "retryInSeconds": round(remaining)}


class DailyBudget:
    """In-memory count of paid fallback calls per UTC day."""

    def __init__(self, limit: int, today: Callable[[], date] = lambda: datetime.now(UTC).date()):
        self._limit = limit
        self._today = today
        self._day = today()
        self._used = 0
        self._lock = threading.Lock()

    def _roll(self) -> None:
        if self._today() != self._day:
            self._day, self._used = self._today(), 0

    def try_consume(self) -> bool:
        with self._lock:
            self._roll()
            if self._used >= self._limit:
                return False
            self._used += 1
            return True

    def remaining(self) -> int:
        with self._lock:
            self._roll()
            return max(0, self._limit - self._used)


class FailoverGenerationProvider:
    name = "failover"

    def __init__(
        self,
        providers: Sequence[GenerationProvider],
        *,
        primary_timeout: float = 12.0,
        fallback_timeout: float = 18.0,
        total_deadline: float = 30.0,
        cooldown_seconds: float = 60.0,
        fallback_daily_limit: int = 50,
        clock: Callable[[], float] = time.monotonic,
        today: Callable[[], date] = lambda: datetime.now(UTC).date(),
    ) -> None:
        names = [p.name for p in providers]
        if len(providers) < 2 or len(set(names)) != len(names) or "failover" in names:
            raise ValueError("failover needs at least two distinct providers")
        self._providers = list(providers)
        self._primary_timeout = primary_timeout
        self._fallback_timeout = fallback_timeout
        self._total_deadline = total_deadline
        self._clock = clock
        self.circuit = CircuitBreaker(cooldown_seconds, clock)
        self.budget = DailyBudget(fallback_daily_limit, today)

    @property
    def model(self) -> str:
        """Ordered provider/model list (part of the cache key and audit metadata)."""
        return ">".join(f"{p.name}:{p.model}" for p in self._providers)

    @property
    def routing_policy(self) -> str:
        return f"{ROUTING_POLICY_VERSION}|{self.model}"

    def health(self) -> dict[str, Any]:
        """Order and circuit status only: no credentials or failure details."""
        return {
            "order": [{"provider": p.name, "model": p.model} for p in self._providers],
            "circuit": self.circuit.snapshot()["state"],
            "fallbackRequestsRemainingToday": self.budget.remaining(),
        }

    def generate(
        self, request: GenerationRequest, timeout: float | None = None
    ) -> GenerationResult:
        raise GenerationUnavailable("use generate_validated for routed generation", kind="other")

    def generate_validated(
        self, request: GenerationRequest, cancel: threading.Event | None = None
    ) -> Outcome:
        deadline = self._clock() + self._total_deadline
        attempted: list[str] = []
        failure_category: str | None = None
        for index, provider in enumerate(self._providers):
            if cancel is not None and cancel.is_set():
                raise GenerationTimeout("request cancelled", kind="cancelled")
            primary = index == 0
            if primary and not self.circuit.allow():
                failure_category = "circuit_open"
                continue
            remaining = deadline - self._clock()
            if remaining < _MIN_CALL_SECONDS:
                raise GenerationTimeout("total deadline reached", kind="deadline")
            per_call = min(self._primary_timeout if primary else self._fallback_timeout, remaining)
            is_fallback = bool(attempted) or failure_category is not None
            if is_fallback and provider.name in PAID_PROVIDERS and not self.budget.try_consume():
                self._warn_budget(attempted)
                raise GenerationUnavailable(
                    "paid fallback limit reached", kind="fallback_budget_exhausted"
                )
            attempted.append(provider.name)
            started = time.perf_counter()
            try:
                result = provider.generate(request, timeout=per_call)
            except GenerationFailure as exc:
                if primary:
                    if exc.kind in CIRCUIT_KINDS:
                        self.circuit.record_failure(exc.retry_after)
                    else:
                        self.circuit.release_probe()
                if not exc.fallback_allowed:
                    raise
                failure_category = exc.kind
                continue
            try:
                outcome = validate_result(result, request, started)
            except GenerationInvalid:
                if primary:
                    self.circuit.release_probe()
                raise  # schema failure: final, never sent to another provider
            if primary:
                self.circuit.record_success()
            meta = dataclasses.replace(
                outcome.meta,
                attempted=tuple(attempted),
                fallback_used=index > 0,
                failure_category=failure_category,
            )
            return Outcome(outcome.verdict, outcome.output, meta)
        raise GenerationUnavailable("all providers failed", kind="all_providers_failed")

    def _warn_budget(self, attempted: Sequence[str]) -> None:
        logger.warning(
            "assistant fallback_budget_exhausted attempted=%s limit_reached=true",
            ",".join(attempted) or "-",
        )
