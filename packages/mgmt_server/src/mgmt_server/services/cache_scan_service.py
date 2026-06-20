"""Cache scan service for detecting unused repositories."""

from __future__ import annotations

import time
from datetime import datetime

from cache.keys import CacheKeys
from cache.services.cache import CacheService
from database.db_models import RepoStatus
from database.db_repositories import (
    HfRepoProfileRepository,
)
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from storage import S3Client

from mgmt_server.api.v1.schemas.cache_scan import (
    RepoScanItem,
    ScanCategory,
    ScanResultData,
)


class CacheScanService:
    """Service for scanning all cached repositories from S3 storage.

    Scans S3 storage directly, grouping objects by repo-level prefix to
    compute actual disk usage. DB profiles are consulted to classify
    repos as tracked (has DB record) or untracked (S3-only) — S3 is the
    source of truth for *which* repos exist and how much space they consume.
    """

    def __init__(
        self,
        session: AsyncSession,
        cache: CacheService,
        s3: S3Client,
    ) -> None:
        self._session = session
        self._cache = cache
        self._s3 = s3
        self._profile_repo = HfRepoProfileRepository(session)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def scan(self) -> ScanResultData:
        """Scan S3 storage and identify repos that can be cleaned up.

        Walks every object under ``hf/`` in a single pass, aggregates
        sizes per repo prefix, then cross-references DB profiles to
        classify each S3-backed repository.

        Categories
        ----------
        * **tracked** – S3 data exists and a corresponding DB profile
          was found (regardless of status, except CLEANING/CLEANED).
        * **untracked** – S3 data exists but no DB profile was found.
          These are invisible to a DB-only scan.
        """
        # 1. One-pass S3 listing → aggregate sizes per repo prefix
        prefix_sizes: dict[str, int] = {}
        async for obj in self._s3.list_all_objects("hf/"):
            group = _repo_group_key(obj["key"])
            if group is not None:
                prefix_sizes[group] = prefix_sizes.get(group, 0) + obj["size"]

        if not prefix_sizes:
            logger.info("Cache scan: no objects found under hf/ prefix")
            result = ScanResultData(
                scanned_at=datetime.now(),
                total_tracked_repos=0,
                total_untracked_repos=0,
                total_wasted_bytes=0,
                repos=[],
            )
            await self._cache.set(
                CacheKeys.cache_scan.key("result"),
                {
                    "data": result.model_dump(mode="json"),
                    "_cached_at": time.time(),
                },
                ttl=CacheKeys.cache_scan.ttl,
            )
            return result

        # 2. Parse each prefix → (repo_id, repo_type)
        parsed: list[tuple[str, str, str, int]] = []  # (repo_id, repo_type, prefix, size)
        for prefix, size in prefix_sizes.items():
            pair = _parse_repo_identifier(prefix)
            if pair is not None:
                repo_id, repo_type = pair
                parsed.append((repo_id, repo_type, prefix, size))
            else:
                logger.debug("Skipping unparseable S3 prefix: {}", prefix)

        # 3. Batch-fetch DB profiles
        pairs = [(repo_id, repo_type) for repo_id, repo_type, _, _ in parsed]
        profiles = await self._profile_repo.get_profiles_by_pairs(pairs)

        repos: list[RepoScanItem] = []
        total_wasted = 0
        tracked_count = 0
        untracked_count = 0

        for repo_id, repo_type, _prefix, cached_size in parsed:
            profile = profiles.get((repo_id, repo_type))

            # --- untracked: S3 has data but DB has no record ---
            if profile is None:
                repos.append(
                    RepoScanItem(
                        category=ScanCategory.untracked,
                        repo_id=repo_id,
                        repo_type=repo_type,
                        pipeline_tag=None,
                        downloads=0,
                        last_downloaded_at=None,
                        first_cached_at=None,
                        cache_updated_at=None,
                        cached_commits=0,
                        cached_size=cached_size,
                    )
                )
                total_wasted += cached_size
                untracked_count += 1
                continue

            # --- skip repos that are being cleaned or already cleaned ---
            if profile.status in (RepoStatus.CLEANING, RepoStatus.CLEANED):
                continue

            # --- tracked: has a DB profile ---
            repos.append(
                RepoScanItem(
                    category=ScanCategory.tracked,
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
            tracked_count += 1

        result = ScanResultData(
            scanned_at=datetime.now(),
            total_tracked_repos=tracked_count,
            total_untracked_repos=untracked_count,
            total_wasted_bytes=total_wasted,
            repos=repos,
        )

        await self._cache.set(
            CacheKeys.cache_scan.key("result"),
            {
                "data": result.model_dump(mode="json"),
                "_cached_at": time.time(),
            },
            ttl=CacheKeys.cache_scan.ttl,
        )

        logger.info(
            "Cache scan complete: {} tracked, {} untracked, {:.2f} GB total",
            tracked_count,
            untracked_count,
            total_wasted / (1024**3),
        )
        return result

    async def get_result(self) -> ScanResultData | None:
        """Get the most recent scan result from Redis cache."""
        cached = await self._cache.get(CacheKeys.cache_scan.key("result"))
        if cached is None:
            return None
        try:
            return ScanResultData(**cached["data"])
        except Exception:
            await self._cache.delete(CacheKeys.cache_scan.key("result"))
            return None

    async def remove_repos_from_cached_result(
        self, repo_ids: set[str],
    ) -> None:
        """Remove deleted repos from the cached scan result.

        Called after successful deletion so that subsequent reads of the
        scan cache reflect the current S3 / DB state without requiring a
        full re-scan.
        """
        await _remove_repos_from_cache(self._cache, repo_ids)


# ------------------------------------------------------------------
# Internal helpers
# ------------------------------------------------------------------


async def _remove_repos_from_cache(
    cache: CacheService, repo_ids: set[str],
) -> None:
    """Remove *repo_ids* from the scan result held in Redis.

    This is a module-level function so it can be reused by the batch
    delete service which only has a ``CacheService``, not a full
    ``CacheScanService`` instance.
    """
    cached = await cache.get(CacheKeys.cache_scan.key("result"))
    if cached is None:
        return
    data: dict | None = cached.get("data")
    if not data:
        return
    repos: list[dict] = data.get("repos", [])
    if not repos:
        return

    remaining = [r for r in repos if r.get("repo_id") not in repo_ids]
    if len(remaining) == len(repos):
        return  # no repos matched — nothing to do

    # Recalculate aggregate counts
    data["repos"] = remaining
    data["total_tracked_repos"] = sum(
        1 for r in remaining if r.get("category") == "tracked"
    )
    data["total_untracked_repos"] = sum(
        1 for r in remaining if r.get("category") == "untracked"
    )
    data["total_wasted_bytes"] = sum(
        r.get("cached_size", 0) for r in remaining
    )

    await cache.set(
        CacheKeys.cache_scan.key("result"),
        {"data": data, "_cached_at": time.time()},
        ttl=CacheKeys.cache_scan.ttl,
    )
    logger.debug(
        "Removed {} deleted repo(s) from cached scan result",
        len(repos) - len(remaining),
    )


def _repo_group_key(key: str) -> str | None:
    """Extract the repo-level grouping prefix from an S3 object key.

    Keys are expected in the form::

        hf/{repo_type}--{namespace}--{repo_name}/blobs/{blob_id}

    Returns everything up to (and including) the second ``/``, e.g.
    ``"hf/model--facebook--bart-large/"``, or ``None`` if the key
    does not have enough segments.
    """
    parts = key.split("/", 2)
    if len(parts) < 2:
        return None
    return f"{parts[0]}/{parts[1]}/"


def _parse_repo_identifier(prefix: str) -> tuple[str, str] | None:
    """Parse a repo group prefix back into *(repo_id, repo_type)*.

    >>> _parse_repo_identifier("hf/model--facebook--bart-large/")
    ('facebook/bart-large', 'model')
    """
    # Strip "hf/" and trailing "/"
    identifier = prefix[3:].rstrip("/")
    parts = identifier.split("--")
    if len(parts) != 3:
        return None
    repo_type, namespace, repo_name = parts
    return (f"{namespace}/{repo_name}", repo_type)
