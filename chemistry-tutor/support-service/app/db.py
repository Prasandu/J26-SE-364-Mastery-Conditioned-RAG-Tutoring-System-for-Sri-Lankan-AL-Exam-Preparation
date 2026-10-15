from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

# Convert postgresql:// to the psycopg3 driver URL
_db_url = settings.database_url.replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(
    _db_url,
    execution_options={"schema_translate_map": {None: settings.db_schema}},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
