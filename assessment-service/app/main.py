import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import admin, attempts, auth, papers, resources, review
from app.config import get_settings
from app.errors import DomainError

logger = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description="Intelligent Assessment & Automated Evaluation for A/L Chemistry (J26-SE-364)",
    version="0.1.0",
)
# The frontend runs on another port, so the browser needs this to allow the calls.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(papers.router)
app.include_router(attempts.router)
app.include_router(review.router)
app.include_router(admin.router)
app.include_router(resources.router)


@app.exception_handler(DomainError)
async def domain_error_handler(_: Request, error: DomainError) -> JSONResponse:
    body: dict = {"detail": error.message}
    if error.errors:
        body["errors"] = error.errors
    return JSONResponse(status_code=error.status_code, content=body)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, error: RequestValidationError) -> JSONResponse:
    """FastAPI's own default shape puts a list of objects in `detail`, not the string
    every other error on this API uses - a caller checking `detail` is a string (the
    frontend does exactly this) would see a generic error instead of what was
    actually wrong. Normalised here to the same {detail, errors} shape as DomainError,
    with nothing lost: every field message is still in `errors`.
    """
    problems = [f"{'.'.join(str(part) for part in e['loc'][1:])}: {e['msg']}" for e in error.errors()]
    return JSONResponse(
        status_code=422,  # matches ContentValidationError's own status_code
        content={"detail": "The request did not match what was expected", "errors": problems},
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, error: Exception) -> JSONResponse:
    """Anything not already handled above: a database error, a bug, a dependency
    that raised something nobody anticipated. FastAPI's own HTTPException (used
    directly in a few places, e.g. app/security.py) has its own specific handler
    registered ahead of this one, so it is unaffected - this only ever catches what
    nothing more specific claimed.

    Logged in full server-side, because that is where someone can actually act on
    it; the caller gets a fixed, safe message with nothing from the exception itself,
    which can hold internals (a connection string, a file path, a stack frame) that
    are not this caller's to see.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Something went wrong. Please try again."},
    )


@app.get("/health", tags=["system"])
def health() -> dict:
    """Simple check that the service is running."""
    return {"status": "ok", "service": settings.app_name, "env": settings.app_env}
