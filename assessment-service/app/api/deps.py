"""Shared FastAPI dependencies. Tests replace these with fakes."""

from fastapi import Depends

from app.ai import build_judge
from app.config import Settings, get_settings
from app.db import SessionLocal
from app.services.attempts import SessionFactory
from app.services.judge import AnswerJudge


def get_session_factory() -> SessionFactory:
    """For background work that runs after the request's own session is closed."""
    return SessionLocal


def get_judge(settings: Settings = Depends(get_settings)) -> AnswerJudge | None:
    """The AI judge, or None when it is not configured (written answers then stay pending)."""
    return build_judge(settings)
