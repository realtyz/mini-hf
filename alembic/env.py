import os
from logging.config import fileConfig
from typing import cast

from sqlalchemy import create_engine, pool

from alembic import context
from sqlalchemy.orm import DeclarativeBase

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# this line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)


# Standalone Base class - mirrors database.db_models.base.Base
# This avoids importing the database package in env.py
class Base(DeclarativeBase):
    """Base class for all models."""

    pass


def get_target_metadata():
    """Return target metadata for autogenerate."""
    return Base.metadata


# Get database URL from environment or construct from settings
def get_database_url():
    """Get database URL from environment variables."""
    if os.getenv("DATABASE_URL"):
        return os.getenv("DATABASE_URL")

    # Construct from individual env vars
    host = os.getenv("PG_HOST", "localhost")
    port = os.getenv("PG_PORT", "5432")
    user = os.getenv("PG_USERNAME", "postgres")
    password = os.getenv("PG_PASSWORD", "postgres")
    database = os.getenv("PG_DATABASE", "mini_hf")

    return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{database}"


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = cast(str, get_database_url())
    context.configure(
        url=url,
        target_metadata=get_target_metadata(),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    url = cast(str, get_database_url())
    connectable = create_engine(url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=get_target_metadata(),
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
