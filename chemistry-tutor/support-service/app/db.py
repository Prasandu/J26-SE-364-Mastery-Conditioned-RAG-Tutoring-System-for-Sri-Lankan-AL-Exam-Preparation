from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

# Convert postgresql:// to the psycopg3 driver URL
_db_url = settings.database_url.replace("postgresql://", "postgresql+psycopg://", 1)

# pool_pre_ping: check a pooled connection is alive before using it, and
# transparently reconnect if not. Helps with the intermittent DNS/connection
# hiccups observed against the Supabase pooler shortly after server restart.
engine = create_engine(_db_url, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Schema is declared explicitly here (not via a runtime schema_translate_map)
# so Alembic's autogenerate correctly matches it against the real database
# schema instead of seeing every table as "removed and re-added".
metadata = MetaData(schema=settings.db_schema)


class Base(DeclarativeBase):
    metadata = metadata


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
