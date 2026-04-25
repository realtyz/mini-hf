"""Repository management service for read, delete, and cache-status operations."""

from __future__ import annotations

import asyncio

from database.db_models import HfRepoProfile, HfRepoSnapshot, HfRepoTreeItem, RepoStatus
from database.db_repositories import (
    HfRepoProfileRepository,
    HfRepoSnapshotRepository,
    HfRepoTreeRepository,
)
from database.db_repositories.hf_repo_snapshot import SizeStats
from loguru import logger
from services.task import TaskService
from sqlalchemy.ext.asyncio import AsyncSession
from storage import build_blob_key, s3_client

from mgmt_server.api.v1.schemas import DeleteRepoResult
from mgmt_server.core.exceptions import (
    ConflictError,
    NotFoundError,
    ValidationError,
)

_BLOB_DELETE_CONCURRENCY = 8


class RepoService:
    """Service for repository lifecycle management."""

    def __init__(self, session: AsyncSession, task_service: TaskService) -> None:
        self._session = session
        self._task_service = task_service
        self._profile_repo = HfRepoProfileRepository(session)
        self._snapshot_repo = HfRepoSnapshotRepository(session)
        self._tree_repo = HfRepoTreeRepository(session)

    # ------------------------------------------------------------------
    # Read helpers (used by routes)
    # ------------------------------------------------------------------

    async def list_repos(
        self,
        repo_type: str | None = None,
        skip: int = 0,
        limit: int = 20,
        statuses: list[RepoStatus] | None = None,
        pipeline_tag: str | None = None,
        search: str | None = None,
        sort_by: str = "cache_updated_at",
        sort_order: str = "desc",
    ) -> tuple[list[HfRepoProfile], int]:
        """List repositories with filtering, search, sorting and pagination."""
        return await self._profile_repo.list_repos(
            repo_type=repo_type,
            skip=skip,
            limit=limit,
            statuses=statuses,
            pipeline_tag=pipeline_tag,
            search=search,
            sort_by=sort_by,
            sort_order=sort_order,
        )

    async def get_profile_by_repo_id(self, repo_id: str) -> HfRepoProfile | None:
        """Get repository profile by repo_id (without repo_type filter)."""
        return await self._profile_repo.get_profile_by_repo_id(repo_id)

    async def get_repo_detail(
        self,
        repo_id: str,
        repo_type: str,
    ) -> tuple[HfRepoProfile | None, list[HfRepoSnapshot], dict[str, SizeStats]]:
        """Get repository detail with profile and snapshots.

        Returns:
            Tuple of (profile, snapshots, size_stats dict)
        """
        profile, snapshots = await self._profile_repo.get_profile_with_snapshots(
            repo_id, repo_type=repo_type
        )

        size_stats: dict[str, SizeStats] = {}
        if snapshots:
            size_stats = await self._snapshot_repo.get_snapshot_size_stats(
                [s.commit_hash for s in snapshots]
            )

        return profile, snapshots, size_stats

    async def get_file_download_url(
        self,
        repo_id: str,
        commit_hash: str,
        path: str,
    ) -> str:
        """Get presigned S3 download URL for a cached file.

        Raises:
            NotFoundError: If snapshot or file not found
            ValidationError: If file is not cached or metadata corrupted
        """
        snapshots = await self._snapshot_repo.get_snapshots_by_commit(
            repo_id, commit_hash
        )
        if not snapshots:
            raise NotFoundError(
                f"Snapshot with commit '{commit_hash}' not found for repository '{repo_id}'"
            )

        repo_type = snapshots[0].repo_type

        tree_item = await self._tree_repo.get_tree_item_by_path(commit_hash, path)
        if tree_item is None:
            raise NotFoundError(f"File '{path}' not found in snapshot")

        if not tree_item.is_cached:
            raise ValidationError(f"File '{path}' is not cached yet")

        blob_id = tree_item.lfs_oid if tree_item.lfs_oid else tree_item.oid
        if not blob_id:
            raise ValidationError(f"File metadata corrupted: '{path}'")

        key = build_blob_key(repo_id, repo_type, blob_id)
        download_filename = path.split("/")[-1]
        presigned_url = await s3_client.create_presigned_url(
            key, download_filename=download_filename
        )
        return presigned_url

    async def get_repo_tree(
        self, repo_id: str, commit_hash: str
    ) -> list[HfRepoTreeItem]:
        """Get repository file tree for a specific commit.

        Raises:
            NotFoundError: If snapshot not found
        """
        snapshots = await self._snapshot_repo.get_snapshots_by_commit(
            repo_id, commit_hash
        )
        if not snapshots:
            raise NotFoundError(
                f"Snapshot with commit '{commit_hash}' not found for repository '{repo_id}'"
            )
        return await self._tree_repo.get_file_tree(commit_hash)

    # ------------------------------------------------------------------
    # Delete orchestration (used by routes)
    # ------------------------------------------------------------------

    async def delete_repo(
        self,
        repo_id: str,
        hard: bool = False,
    ) -> DeleteRepoResult:
        """Delete an entire cached repository with all pre-checks.

        Args:
            repo_id: Repository ID
            hard: If true, hard delete (remove all records). If false, soft delete.

        Raises:
            NotFoundError: If repo not found
            ConflictError: If repo is updating or has active tasks
        """
        profile = await self._profile_repo.get_profile_by_repo_id(repo_id)

        if profile is None:
            raise NotFoundError(f"Repository '{repo_id}' not found")

        if profile.status == RepoStatus.UPDATING:
            raise ConflictError(
                f"Repository '{repo_id}' is currently being updated. "
                "Please wait for the update to complete before deleting."
            )

        repo_type = profile.repo_type

        if await self._task_service.has_active_download_task(repo_id):
            raise ConflictError(
                f"Repository '{repo_id}' has active download tasks. "
                "Please wait for downloads to complete before deleting."
            )

        if hard:
            result = await self._delete_repository(repo_id, repo_type, hard=True)
        else:
            result = await self._delete_repository(repo_id, repo_type)

        return result

    # ------------------------------------------------------------------
    # Internal delete implementations
    # ------------------------------------------------------------------

    async def _delete_repository(
        self,
        repo_id: str,
        repo_type: str,
        hard: bool = False,
    ) -> DeleteRepoResult:
        """Delete repository core logic.

        Deletes DB records first, then S3 blobs. If S3 deletion partially
        fails the DB state is still consistent — the profile is already
        deleted/soft-deleted and the orphaned blobs can be cleaned up later.
        """
        await self._profile_repo.set_profile_status(
            repo_id, repo_type, RepoStatus.CLEANING
        )

        snapshots = await self._snapshot_repo.get_all_snapshots(repo_id)

        if not snapshots:
            if hard:
                profile_deleted = await self._profile_repo.delete_profile(
                    repo_id, repo_type
                )
                return DeleteRepoResult(
                    deleted=True,
                    repo_id=repo_id,
                    snapshots_deleted=0,
                    tree_items_deleted=0,
                    blobs_deleted=0,
                    blobs_failed=0,
                    profile_deleted=profile_deleted,
                )
            await self._profile_repo.soft_delete_profile(repo_id, repo_type)
            return DeleteRepoResult(
                deleted=True,
                repo_id=repo_id,
                snapshots_deleted=0,
                blobs_deleted=0,
                blobs_failed=0,
                message=f"No snapshots found for {repo_id}, profile marked as cleaned",
            )

        logger.info(
            "{} {} snapshots for {}",
            "Hard deleting" if hard else "Deleting",
            len(snapshots),
            repo_id,
        )

        # Collect blob IDs before deleting DB records
        all_blob_ids: set[str] = set()
        for snapshot in snapshots:
            blob_ids = await self._tree_repo.get_blob_ids_by_snapshot(
                snapshot.commit_hash
            )
            all_blob_ids.update(blob_ids)

        # Delete DB records first
        tree_items_deleted = 0
        if hard:
            for snapshot in snapshots:
                count = await self._tree_repo.delete_items_by_snapshot(
                    snapshot.commit_hash
                )
                tree_items_deleted += count

        for snapshot in snapshots:
            await self._snapshot_repo.delete_snapshot(snapshot.commit_hash)

        if hard:
            profile_deleted = await self._profile_repo.delete_profile(
                repo_id, repo_type
            )
        else:
            await self._profile_repo.soft_delete_profile(repo_id, repo_type)

        # Now delete S3 blobs (DB is already consistent)
        deleted_blobs, failed_blobs = await self._delete_blobs_from_ids(
            repo_id, repo_type, all_blob_ids
        )

        hard_extras = (
            {
                "tree_items_deleted": tree_items_deleted,
                "profile_deleted": profile_deleted,
            }
            if hard
            else {}
        )
        return DeleteRepoResult(
            deleted=True,
            repo_id=repo_id,
            snapshots_deleted=len(snapshots),
            blobs_deleted=deleted_blobs,
            blobs_failed=failed_blobs,
            **hard_extras,
        )

    async def _delete_blobs_from_ids(
        self,
        repo_id: str,
        repo_type: str,
        blob_ids: set[str],
    ) -> tuple[int, int]:
        """Delete blobs from S3 by their IDs concurrently."""
        if not blob_ids:
            return 0, 0

        logger.info("Found {} unique blobs to delete for {}", len(blob_ids), repo_id)

        semaphore = asyncio.Semaphore(_BLOB_DELETE_CONCURRENCY)

        async def _delete_one(blob_id: str) -> bool:
            async with semaphore:
                s3_key = build_blob_key(repo_id, repo_type, blob_id)
                try:
                    await s3_client.delete_file(s3_key)
                    return True
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    logger.error("Failed to delete blob {}: {}", blob_id[:12], e)
                    return False

        results = await asyncio.gather(*[_delete_one(bid) for bid in blob_ids])
        deleted = sum(1 for ok in results if ok)
        failed = len(results) - deleted
        return deleted, failed

    # ------------------------------------------------------------------
    # Cache status check (used by preview executor)
    # ------------------------------------------------------------------

    async def check_cached_status(
        self,
        repo_id: str,
        repo_type: str,
        revision: str,
        required_file_paths: set[str],
    ) -> tuple[bool, str | None]:
        """Check if all required files are already cached for a repository revision."""
        active_snapshot = await self._snapshot_repo.get_active_snapshot(
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
        )

        if not active_snapshot:
            return False, None

        cached_paths = await self._tree_repo.get_cached_paths(
            active_snapshot.commit_hash
        )

        all_cached = required_file_paths.issubset(cached_paths)
        return all_cached, active_snapshot.commit_hash
