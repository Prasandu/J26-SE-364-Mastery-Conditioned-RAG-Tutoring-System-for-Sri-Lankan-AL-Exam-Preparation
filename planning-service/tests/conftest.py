import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://test:test@127.0.0.1:5432/planning_test",
)
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-at-least-32-bytes")
os.environ.setdefault("INGEST_API_KEY", "test-ingest-key")
os.environ.setdefault("MODEL_DIR", "test-models")

import pytest  # noqa: E402

# A disposable PostgreSQL for the tests that need real constraints, JSONB and the Alembic
# chain (tests/test_finalized_marks_db.py, tests/test_cross_student_db.py). Those tests skip
# without it. Never a shared or production database: the planning schema is dropped.
PG_URL = os.environ.get("PLANNING_TEST_PG_URL")
KEEP_TABLES = {"topics", "questions", "papers", "alembic_version"}


@pytest.fixture(scope="module")
def pg_engine():
    if not PG_URL:
        pytest.skip("PLANNING_TEST_PG_URL (disposable Postgres) not set")
    from pathlib import Path

    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    from app.config import settings
    from scripts.seed_topics import DEFAULT_TOPICS_PATH, load_topics, seed_topics

    root = Path(__file__).resolve().parents[1]
    original = settings.database_url
    settings.database_url = PG_URL  # read by migrations/env.py
    engine = create_engine(PG_URL)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP SCHEMA IF EXISTS planning CASCADE"))
        config = Config(str(root / "alembic.ini"))
        config.set_main_option("script_location", str(root / "migrations"))
        command.upgrade(config, "head")
        with sessionmaker(bind=engine)() as session:
            seed_topics(session, load_topics(DEFAULT_TOPICS_PATH))
        yield engine
    finally:
        settings.database_url = original
        engine.dispose()


@pytest.fixture
def pg_session(pg_engine):
    """A session like app.db.SessionLocal (autoflush off) on emptied student tables."""
    from sqlalchemy import text
    from sqlalchemy.orm import sessionmaker

    with pg_engine.begin() as connection:
        # Real tables only: some models map views (e.g. planning.attempts).
        names = connection.scalars(text("SELECT tablename FROM pg_tables WHERE schemaname = 'planning'"))
        tables = [f"planning.{name}" for name in names if name not in KEEP_TABLES]
        connection.execute(text(f"TRUNCATE {', '.join(tables)} CASCADE"))
    factory = sessionmaker(bind=pg_engine, autoflush=False, autocommit=False)
    with factory() as session:
        yield session
