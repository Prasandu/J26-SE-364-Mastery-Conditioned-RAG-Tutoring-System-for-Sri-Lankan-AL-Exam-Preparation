import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.health import router as health_router
from app.api.questions import router as questions_router
from app.api.students import router as students_router
from app.api.tutor import router as tutor_router
from app.api.voice import router as voice_router
from app.config import settings
from app.db import engine

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    _warm_up_database_connection()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

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
