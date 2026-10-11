from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.errors import register_error_handlers

app = FastAPI(
    title="Planning Service",
    description="Adaptive study planning and learning analytics.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    """Expose a lightweight process health check without depending on the database."""
    return {"status": "ok", "service": "planning-service"}
