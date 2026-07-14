"""Dashboard statistics service."""

from __future__ import annotations

import asyncio
import time
import uuid
from typing import Final

from cache.keys import CacheKeys
from cache.services.cache import CacheService
from database.db_models import HfRepoProfile, MsRepoProfile, RepoStatus
from database.db_repositories import HfRepoProfileRepository, MsRepoProfileRepository
from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from storage.client import s3_client

from mgmt_server.api.v1.schemas.repos import DashboardStats

_CACHE_PHYSICAL_TTL: Final[int] = 1800  # 30 minutes
_REBUILD_LOCK_TIMEOUT: Final[int] = 60

# Busy-wait retry settings (exponential backoff)
_RETRY_ATTEMPTS: Final[int] = 5
_RETRY_BASE_DELAY: Final[float] = 0.1  # 100ms initial, doubles each attempt
_MAX_RETRY_DELAY: Final[float] = 1.0

# Tracks all outstanding background rebuild tasks (module-level to avoid
# mutable class-variable pitfalls in tests).
_bg_tasks: set[asyncio.Task] = set()


async def _fetch_stats_from_sources(
    session: AsyncSession,
    repo: HfRepoProfileRepository | None = None,
    ms_repo: MsRepoProfileRepository | None = None,
) -> DashboardStats:
    """Fetch dashboard stats from DB and S3 using the given session."""
    if repo is None:
        repo = HfRepoProfileRepository(session)
    if ms_repo is None:
        ms_repo = MsRepoProfileRepository(session)

    active_statuses = [RepoStatus.ACTIVE, RepoStatus.UPDATING, RepoStatus.CLEANING]

    hf_repos = await repo.count_repos(statuses=active_statuses)
    ms_repos = await ms_repo.count_repos(statuses=active_statuses)

    hf_downloads_stmt = select(func.sum(HfRepoProfile.downloads))
    hf_result = await session.execute(hf_downloads_stmt)
    hf_downloads = hf_result.scalar() or 0

    ms_downloads_stmt = select(func.sum(MsRepoProfile.downloads))
    ms_result = await session.execute(ms_downloads_stmt)
    ms_downloads = ms_result.scalar() or 0

    bucket_stats = await s3_client.get_bucket_stats()

    return DashboardStats(
        total_repos=hf_repos + ms_repos,
        hf_repos=hf_repos,
        ms_repos=ms_repos,
        total_files=bucket_stats["total_files"],
        storage_capacity=bucket_stats["total_size"],
        total_downloads=hf_downloads + ms_downloads,
    )


async def _rebuild_cache_in_background(cache: CacheService) -> None:
    """Background task: rebuild dashboard stats.

    Creates its own session and cache client so it does not depend on
    any request-scoped objects.
    """
    from database import new_session

    try:
        async with new_session() as session:
            stats = await _fetch_stats_from_sources(session)
            await session.commit()

        await cache.set(
            CacheKeys.stats.key("dashboard"),
            {
                "data": stats.model_dump(),
                "_expires_at": time.time() + CacheKeys.stats.ttl,
            },
            ttl=_CACHE_PHYSICAL_TTL,
        )
    finally:
        await cache.delete(CacheKeys.stats.key("rebuild_lock"))


class DashboardService:
    """Service for dashboard statistics with stale-while-revalidate caching."""

    def __init__(self, session: AsyncSession, cache: CacheService) -> None:
        self._session = session
        self._cache = cache
        self._profile_repo = HfRepoProfileRepository(session)
        self._ms_profile_repo = MsRepoProfileRepository(session)

    async def _fetch_stats(self) -> DashboardStats:
        """Fetch dashboard stats from DB and S3 using the request-scoped session."""
        return await _fetch_stats_from_sources(
            self._session, repo=self._profile_repo, ms_repo=self._ms_profile_repo
        )

    async def get_stats(self) -> DashboardStats:
        """Get dashboard statistics using stale-while-revalidate cache strategy.

        Returns aggregated statistics for the dashboard:
        - total_repos: Total number of repositories (excluding inactive)
        - hf_repos: Total number of HuggingFace repositories (excluding inactive)
        - ms_repos: Total number of ModelScope repositories (excluding inactive)
        - total_files: Total number of files in S3 bucket
        - storage_capacity: Total storage size in bytes
        - total_downloads: Total download count across all repositories
        """
        now = time.time()

        # 1. Try reading from cache
        cached = await self._cache.get(CacheKeys.stats.key("dashboard"))
        if cached:
            expires_at = cached.get("_expires_at", 0)
            if now < expires_at:
                # Cache is still fresh
                logger.debug("Dashboard stats cache hit (fresh)")
                return DashboardStats(**cached["data"])

            # Logically expired: return stale data immediately and rebuild in background
            logger.debug("Dashboard stats cache stale, triggering background rebuild")
            await self._trigger_background_rebuild()
            return DashboardStats(**cached["data"])

        # 2. Cache miss: synchronously rebuild with distributed lock to prevent
        #    multiple requests from hitting the DB and S3 concurrently.
        lock_acquired = await self._acquire_rebuild_lock()
        if lock_acquired:
            logger.debug("Dashboard stats cache miss, rebuilding synchronously")
            try:
                stats = await self._fetch_stats()
                await self._cache.set(
                    CacheKeys.stats.key("dashboard"),
                    {
                        "data": stats.model_dump(),
                        "_expires_at": now + CacheKeys.stats.ttl,
                    },
                    ttl=_CACHE_PHYSICAL_TTL,
                )
                return stats
            finally:
                await self._cache.delete(CacheKeys.stats.key("rebuild_lock"))

        # 3. Another request is rebuilding the cache. Wait with exponential
        #    backoff and retry.
        delay = _RETRY_BASE_DELAY
        for _ in range(_RETRY_ATTEMPTS):
            await asyncio.sleep(delay)
            cached = await self._cache.get(CacheKeys.stats.key("dashboard"))
            if cached:
                return DashboardStats(**cached["data"])
            delay = min(delay * 2, _MAX_RETRY_DELAY)

        # 4. Fallback: if the lock holder crashed and left the cache empty,
        #    fetch directly (sacrificing speed for availability).
        return await self._fetch_stats()

    async def _acquire_rebuild_lock(self) -> bool:
        """Try to acquire the distributed rebuild lock. Returns True if acquired."""
        return await self._cache.set_nx(
            CacheKeys.stats.key("rebuild_lock"), str(uuid.uuid4()), _REBUILD_LOCK_TIMEOUT
        )

    async def _trigger_background_rebuild(self) -> None:
        """Trigger a background cache rebuild if no rebuild is already in progress."""
        acquired = await self._acquire_rebuild_lock()
        if acquired:
            task = asyncio.create_task(_rebuild_cache_in_background(self._cache))
            _bg_tasks.add(task)
            task.add_done_callback(_bg_tasks.discard)
