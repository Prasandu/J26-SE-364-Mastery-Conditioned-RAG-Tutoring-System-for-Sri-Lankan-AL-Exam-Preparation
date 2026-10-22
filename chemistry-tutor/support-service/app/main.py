import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text

from app.api.health import router as health_router
from app.api.practice import router as practice_router
from app.api.questions import router as questions_router
from app.api.students import router as students_router
from app.api.tutor import router as tutor_router
from app.api.voice import router as voice_router
from app.config import settings
from app.db import engine
from app.rate_limit import limiter

logger = logging.getLogger(__name__)


def _warm_up_database_connection() -> None:
    """Retry the first DB connection a few times before accepting traffic.

    Observed: right after `uvicorn --reload` restarts, the very first
    request(s) sometimes fail with a DNS resolution error against the
    Supabase pooler host, then succeed moments later on their own. This
    absorbs that startup blip instead of surfacing it as a 500 to the
    first real request (and the frontend, which has no automatic retry).
    """
    max_attempts = 5
    delay_seconds = 1
    for attempt in range(1, max_attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except Exception as exc:
            logger.warning("DB warm-up attempt %d/%d failed: %s", attempt, max_attempts, exc)
            if attempt < max_attempts:
                time.sleep(delay_seconds)
    logger.error("DB warm-up failed after %d attempts; continuing anyway", max_attempts)


def _warm_up_models() -> None:
    """Load the local embedding model at startup instead of on whichever
    request happens to be first (lazy-loaded via lru_cache otherwise, which
    made the first chat/voice request after any server restart multiple
    seconds slower than every request after it). Speech-to-text has no
    local model to warm up — it runs on Groq's hosted API.
    """
    from app.services.rag.embeddings import warm_up as warm_up_embeddings

    try:
        warm_up_embeddings()
    except Exception as exc:
        logger.warning("Warm-up of embedding model failed, will load lazily on first use: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _warm_up_database_connection()
    _warm_up_models()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    # Vite picks a different port if 5173 is taken, so allow any localhost port in dev.
    allow_origin_regex=r"http://localhost:\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api/v1")
app.include_router(tutor_router, prefix="/api/v1")
app.include_router(questions_router, prefix="/api/v1")
app.include_router(students_router, prefix="/api/v1")
app.include_router(voice_router, prefix="/api/v1")
app.include_router(practice_router, prefix="/api/v1")
