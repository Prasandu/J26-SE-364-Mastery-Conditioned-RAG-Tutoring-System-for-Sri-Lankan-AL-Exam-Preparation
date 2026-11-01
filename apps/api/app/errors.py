"""One structured error shape for every failure.

No stack traces, file paths, subprocess output or secrets ever reach a client.
"""

import logging
import re
import uuid
from contextvars import ContextVar

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("vlab.api")

correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="unknown")
_SAFE_CORRELATION = re.compile(r"^[A-Za-z0-9-]{8,64}$")

Detail = str | int | float | bool | None


class ApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        *,
        retryable: bool = False,
        details: dict[str, Detail] | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.retryable = retryable
        self.details = details


def new_correlation_id(incoming: str | None) -> str:
    """Reuse a well-formed incoming ID (for client-side tracing) or generate one."""
    if incoming and _SAFE_CORRELATION.match(incoming):
        return incoming
    return str(uuid.uuid4())


def error_body(
    code: str, message: str, retryable: bool, details: dict[str, Detail] | None = None
) -> dict[str, object]:
    error: dict[str, object] = {
        "code": code,
        "message": message,
        "correlationId": correlation_id_var.get(),
        "retryable": retryable,
    }
    if details:
        error["details"] = details
    return {"error": error}


def _response(status: int, body: dict[str, object]) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=body,
        headers={"X-Correlation-ID": correlation_id_var.get()},
    )


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        logger.info("api_error code=%s status=%s", exc.code, exc.status)
        return _response(exc.status, error_body(exc.code, exc.message, exc.retryable, exc.details))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        details: dict[str, Detail] = {
            "location": ".".join(str(p) for p in first.get("loc", ())),
            "reason": str(first.get("type", "invalid")),
        }
        return _response(
            422, error_body("invalid_request", "Request validation failed", False, details)
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "not_found" if exc.status_code == 404 else "invalid_request"
        message = "Resource not found" if exc.status_code == 404 else "Request not allowed"
        return _response(exc.status_code, error_body(code, message, False))

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception) -> JSONResponse:
        logger.error("unhandled_error type=%s", type(exc).__name__)
        return _response(500, error_body("internal_error", "Internal server error", False))
