import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool, text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from alembic import context

import app.models  # noqa: F401 (registers models on Base.metadata)
from app.config import settings
from app.db import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Use our app settings instead of the hardcoded value in alembic.ini
db_url = settings.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
config.set_main_option("sqlalchemy.url", db_url)

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# import models here so Base.metadata knows about them for autogenerate
target_metadata = Base.metadata

SCHEMA = settings.db_schema


def include_name(name, type_, parent_names):
    # Only compare objects in our own schema. Supabase manages its own
    # internal schemas (auth, storage, realtime, vault, extensions, etc.)
    # and autogenerate must never propose dropping those.
    if type_ == "schema":
        return name == SCHEMA
    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table_schema=SCHEMA,
        include_schemas=True,
        include_name=include_name,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}"))
        connection.commit()

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            version_table_schema=SCHEMA,
            include_schemas=True,
            include_name=include_name,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
