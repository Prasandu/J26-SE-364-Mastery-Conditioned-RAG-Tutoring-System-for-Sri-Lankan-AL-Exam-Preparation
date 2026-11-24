from collections.abc import Iterator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def make_engine(url: str, **kwargs) -> Engine:
    if not url.startswith("sqlite"):
        # pool_pre_ping: reconnect quietly if the cloud database closed an idle connection.
        return create_engine(url, pool_pre_ping=True, **kwargs)

    engine = create_engine(url, connect_args={"check_same_thread": False}, **kwargs)

    # SQLite does not check foreign keys unless this is switched on.
    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    return engine


engine = make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one database session per request."""
    with SessionLocal() as db:
        yield db


def create_all_tables(bind: Engine) -> None:
    """Create tables directly. Only for tests - real databases use Alembic migrations."""
    from app import models  # noqa: F401  (registers the tables on Base)

    Base.metadata.create_all(bind)
