from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import admin, attempts, papers, review
from app.config import get_settings
from app.errors import DomainError

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

app.include_router(papers.router)
app.include_router(attempts.router)
app.include_router(review.router)
app.include_router(admin.router)


@app.exception_handler(DomainError)
async def domain_error_handler(_: Request, error: DomainError) -> JSONResponse:
    body: dict = {"detail": error.message}
    if error.errors:
        body["errors"] = error.errors
    return JSONResponse(status_code=error.status_code, content=body)


@app.get("/health", tags=["system"])
def health() -> dict:
    """Simple check that the service is running."""
    return {"status": "ok", "service": settings.app_name, "env": settings.app_env}
