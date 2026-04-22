"""Dashboard statistics service."""

import asyncio
import time
import uuid

from sqlalchemy import func, select

from cache.services.cache import CacheService
from database.core import AsyncSessionLocal
from database.db_models import HfRepoProfile, RepoStatus
from database.db_repositories import HfRepoProfileRepository
from mgmt_server.api.v1.schemas.repos import DashboardStats
from storage.client import s3_client

CACHE_KEY = "stats"
CACHE_PHYSICAL_TTL = 1800  # 30 minutes
CACHE_LOGICAL_TTL = 60  # 1 minute
REBUILD_LOCK_KEY = "stats:rebuild_lock"
REBUILD_LOCK_TIMEOUT = 60


class DashboardService:
    """Service for dashboard statistics with stale-while-revalidate caching."""

    def __init__(self) -> None:
        self._cache = CacheService(prefix="mini_hf:dashboard:")

    async def get_stats(self, db) -> DashboardStats:
        """Get dashboard statistics using stale-while-revalidate cache strategy.

        Returns aggregated statistics for the dashboard:
        - total_repos: Total number of HuggingFace repositories (excluding inactive)
        - total_files: Total number of files in S3 bucket
        - storage_capacity: Total storage size in bytes
        - total_downloads: Total download count across all repositories
        """
        now = time.time()

        # 1. Try reading from cache
        cached = await self._cache.get(CACHE_KEY)
        if cached:
            expires_at = cached.get("_expires_at", 0)
            if now < expires_at:
                # Cache is still fresh
                return DashboardStats(**cached["data"])

            # Logically expired: return stale data immediately and rebuild in background
            await self._trigger_background_rebuild()
            return DashboardStats(**cached["data"])

        # 2. Cache miss: synchronously rebuild with distributed lock to prevent
        #    multiple requests from hitting the DB and S3 concurrently.
        lock_acquired = await self._cache.set_nx(
            REBUILD_LOCK_KEY, str(uuid.uuid4()), REBUILD_LOCK_TIMEOUT
        )
        if lock_acquired:
            try:
                stats = await self._fetch_stats(db)
                await self._cache.set(
                    CACHE_KEY,
                    {
                        "data": stats.model_dump(),
                        "_expires_at": now + CACHE_LOGICAL_TTL,
                    },
                    ttl=CACHE_PHYSICAL_TTL,
                )
                return stats
            finally:
                await self._cache.redis.delete(self._cache._key(REBUILD_LOCK_KEY))

        # 3. Another request is rebuilding the cache. Wait briefly and retry.
        for _ in range(10):
            await asyncio.sleep(0.2)
            cached = await self._cache.get(CACHE_KEY)
            if cached:
                return DashboardStats(**cached["data"])

        # 4. Fallback: if the lock holder crashed and left the cache empty,
        #    fetch directly (sacrificing speed for availability).
        return await self._fetch_stats(db)

    async def _fetch_stats(self, db) -> DashboardStats:
        """Fetch dashboard stats from DB and S3."""
        repo = HfRepoProfileRepository(db)

        # Get total repos (excluding inactive)
        profiles, total_repos = await repo.list_repos(
            statuses=[RepoStatus.ACTIVE, RepoStatus.UPDATING, RepoStatus.CLEANING],
            limit=1,  # We only need the count
        )

        # Get total downloads (sum of all downloads field)
        downloads_stmt = select(func.sum(HfRepoProfile.downloads))
        result = await db.execute(downloads_stmt)
        total_downloads = result.scalar() or 0

        # Get bucket stats from S3
        bucket_stats = await s3_client.get_bucket_stats()

        return DashboardStats(
            total_repos=total_repos,
            total_files=bucket_stats["total_files"],
            storage_capacity=bucket_stats["total_size"],
            total_downloads=total_downloads,
        )

    async def _rebuild_cache(self) -> None:
        """Background task: rebuild dashboard stats with an independent DB session."""
        async with AsyncSessionLocal() as db:
            try:
                stats = await self._fetch_stats(db)
                await self._cache.set(
                    CACHE_KEY,
                    {
                        "data": stats.model_dump(),
                        "_expires_at": time.time() + CACHE_LOGICAL_TTL,
                    },
                    ttl=CACHE_PHYSICAL_TTL,
                )
            finally:
                await self._cache.redis.delete(self._cache._key(REBUILD_LOCK_KEY))

    async def _trigger_background_rebuild(self) -> None:
        """Trigger a background cache rebuild if no rebuild is already in progress."""
        acquired = await self._cache.set_nx(
            REBUILD_LOCK_KEY, str(uuid.uuid4()), REBUILD_LOCK_TIMEOUT
        )
        if acquired:
            asyncio.create_task(self._rebuild_cache())
