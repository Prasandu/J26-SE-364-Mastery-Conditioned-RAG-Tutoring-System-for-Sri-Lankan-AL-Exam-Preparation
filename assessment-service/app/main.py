from fastapi import FastAPI

from app.api import papers
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description="Intelligent Assessment & Automated Evaluation for A/L Chemistry (J26-SE-364)",
    version="0.1.0",
)
app.include_router(papers.router)


@app.get("/health", tags=["system"])
def health() -> dict:
    """Simple check that the service is running."""
    return {"status": "ok", "service": settings.app_name, "env": settings.app_env}
