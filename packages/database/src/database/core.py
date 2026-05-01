"""Database connection management."""

import warnings
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from core.settings import settings


# Create async engine
DATABASE_URL = (
    f"postgresql+asyncpg://{settings.PG_USERNAME}:{settings.PG_PASSWORD}"
    f"@{settings.PG_HOST}:{settings.PG_PORT}/{settings.PG_DATABASE}"
)

engine = create_async_engine(
    DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
    pool_pre_ping=True,
    pool_recycle=1800,
    pool_size=10,
    max_overflow=10,
    pool_timeout=30,
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


def new_session() -> AsyncSession:
    """Create a new database session.

    The caller is responsible for managing the session lifecycle
    (commit/rollback/close). Use ``async with new_session() as session:``
    for automatic cleanup, then call ``await session.commit()`` explicitly.

    Returns:
        AsyncSession: A new database session
    """
    return AsyncSessionLocal()


async def unit_of_work() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yields a session with automatic transaction management.

    Commits on success, rolls back on exception, always closes.
    Use via ``Depends(unit_of_work)`` in FastAPI route dependencies.

    Yields:
        AsyncSession: A database session that will be committed on success
    """
    session = AsyncSessionLocal()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


# ---------------------------------------------------------------------------
# Deprecated aliases — kept for backward compatibility during migration
# ---------------------------------------------------------------------------


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """[DEPRECATED] Use :func:`unit_of_work` instead.

    This only closes the session — it never commits. Data persistence
    relied on repositories calling commit() internally, which is an
    anti-pattern.  ``unit_of_work`` commits on success and rolls back
    on failure.
    """
    warnings.warn(
        "get_db() is deprecated — use unit_of_work() instead",
        DeprecationWarning,
        stacklevel=2,
    )
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


def get_session() -> AsyncSession:
    """[DEPRECATED] Use :func:`new_session` instead (same behaviour)."""
    warnings.warn(
        "get_session() is deprecated — use new_session() instead",
        DeprecationWarning,
        stacklevel=2,
    )
    return AsyncSessionLocal()
