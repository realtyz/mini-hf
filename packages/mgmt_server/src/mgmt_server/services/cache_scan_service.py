"""Cache scan service for detecting unused repositories."""

from __future__ import annotations

import time
from datetime import datetime

from cache.services.cache import CacheService
from database.db_models import HfRepoProfile, RepoStatus
from database.db_repositories import (
    HfRepoProfileRepository,
    HfRepoSnapshotRepository,
    TaskRepository,
)
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from mgmt_server.api.v1.schemas.cache_scan import (
    RepoScanItem,
    ScanCategory,
    ScanResultData,
)

_CACHE_KEY = "cache_scan:result"
_CACHE_TTL = 90000  # 25 hours in seconds


class CacheScanService:
    """Service for scanning and identifying cold (unused) repositories."""

    def __init__(self, session: AsyncSession, cache: CacheService) -> None:
        self._session = session
        self._cache = cache
        self._profile_repo = HfRepoProfileRepository(session)
        self._snapshot_repo = HfRepoSnapshotRepository(session)
        self._task_repo = TaskRepository(session)

    async def scan(self, threshold_days: int = 90) -> ScanResultData:
        """Scan for cold repositories and cache the result in Redis.

        A repo is considered "cold" if it is ACTIVE but has:
        - Never been downloaded (downloads == 0), or
        - Last downloaded more than threshold_days ago

        A repo is considered "orphan" if it is INACTIVE and:
        - cache_updated_at is older than threshold_days ago
        """
        cold_profiles = await self._profile_repo.list_cold_repos(threshold_days)
        orphan_profiles = await self._profile_repo.list_orphan_repos(threshold_days)

        # Exclude repos that have been cleaned (removed)
        excluded_statuses = {RepoStatus.CLEANED, RepoStatus.CLEANING}
        cold_profiles = [p for p in cold_profiles if p.status not in excluded_statuses]
        orphan_profiles = [p for p in orphan_profiles if p.status not in excluded_statuses]

        cold_ids = {p.repo_id for p in cold_profiles}
        orphan_profiles = [p for p in orphan_profiles if p.repo_id not in cold_ids]

        # Filter NULL-NULL orphans: repos with neither cache_updated_at nor
        # first_cached_at have likely never been downloaded. Keep them only
        # if no active task exists in the queue.
        null_null_profiles = [
            p
            for p in orphan_profiles
            if p.cache_updated_at is None and p.first_cached_at is None
        ]
        if null_null_profiles:
            active_repo_ids = await self._task_repo.get_repos_with_active_tasks(
                [p.repo_id for p in null_null_profiles]
            )
            orphan_profiles = [
                p
                for p in orphan_profiles
                if not (
                    p.cache_updated_at is None
                    and p.first_cached_at is None
                    and p.repo_id in active_repo_ids
                )
            ]

        repos: list[RepoScanItem] = []
        total_wasted = 0

        for profile in cold_profiles:
            cached_size = await self._compute_cached_size(profile)
            repos.append(
                RepoScanItem(
                    category=ScanCategory.cold,
                    repo_id=profile.repo_id,
                    repo_type=profile.repo_type,
                    pipeline_tag=profile.pipeline_tag,
                    downloads=profile.downloads,
                    last_downloaded_at=profile.last_downloaded_at,
                    first_cached_at=profile.first_cached_at,
                    cache_updated_at=profile.cache_updated_at,
                    cached_commits=profile.cached_commits,
                    cached_size=cached_size,
                )
            )
            total_wasted += cached_size

        for profile in orphan_profiles:
            cached_size = await self._compute_cached_size(profile)
            repos.append(
                RepoScanItem(
                    category=ScanCategory.orphan,
                    repo_id=profile.repo_id,
                    repo_type=profile.repo_type,
                    pipeline_tag=profile.pipeline_tag,
                    downloads=profile.downloads,
                    last_downloaded_at=profile.last_downloaded_at,
                    first_cached_at=profile.first_cached_at,
                    cache_updated_at=profile.cache_updated_at,
                    cached_commits=profile.cached_commits,
                    cached_size=cached_size,
                )
            )
            total_wasted += cached_size

        result = ScanResultData(
            scanned_at=datetime.now(),
            threshold_days=threshold_days,
            total_cold_repos=len(cold_profiles),
            total_orphan_repos=len(orphan_profiles),
            total_wasted_bytes=total_wasted,
            repos=repos,
        )

        await self._cache.set(
            _CACHE_KEY,
            {
                "data": result.model_dump(mode="json"),
                "_cached_at": time.time(),
            },
            ttl=_CACHE_TTL,
        )

        logger.info(
            "Cache scan complete: {} cold repos, {} orphan repos, {:.2f} GB wasted",
            result.total_cold_repos,
            result.total_orphan_repos,
            total_wasted / (1024**3),
        )
        return result

    async def get_result(self) -> ScanResultData | None:
        """Get the most recent scan result from Redis cache."""
        cached = await self._cache.get(_CACHE_KEY)
        if cached is None:
            return None
        try:
            return ScanResultData(**cached["data"])
        except Exception:
            await self._cache.delete(_CACHE_KEY)
            return None

    async def _compute_cached_size(self, profile: HfRepoProfile) -> int:
        """Compute total cached file size for a repository across all snapshots."""
        snapshots = await self._snapshot_repo.get_all_snapshots(profile.repo_id)
        if not snapshots:
            return 0

        commit_hashes = [s.commit_hash for s in snapshots]
        size_stats = await self._snapshot_repo.get_snapshot_size_stats(commit_hashes)
        return sum(stats.cached_size for stats in size_stats.values())
