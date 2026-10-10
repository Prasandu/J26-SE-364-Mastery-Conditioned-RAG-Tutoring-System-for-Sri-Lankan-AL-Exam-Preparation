"""Shared FastAPI dependencies. Tests replace these with fakes."""

from fastapi import Depends

from app.ai import build_judge, build_reader
from app.ai.judge import AnswerJudge
from app.config import Settings, get_settings
from app.db import SessionLocal
from app.services.attempts import SessionFactory
from app.services.reader import AnswerReader
from app.services.storage import FileStore, LocalFileStore


def get_session_factory() -> SessionFactory:
    """For background work that runs after the request's own session is closed."""
    return SessionLocal


def get_judge(settings: Settings = Depends(get_settings)) -> AnswerJudge | None:
    """The AI judge, or None when it is not configured (written answers then stay pending)."""
    return build_judge(settings)


def get_reader(settings: Settings = Depends(get_settings)) -> AnswerReader | None:
    """The handwriting reader, or None when no vision model is configured."""
    return build_reader(settings)


def get_file_store(settings: Settings = Depends(get_settings)) -> FileStore:
    return LocalFileStore(settings.upload_dir)
