"""Repository management service for delete operations."""

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from database.db_models import RepoStatus
from database.db_repositories import (
    HfRepoProfileRepository,
    HfRepoSnapshotRepository,
    HfRepoTreeRepository,
)
from mgmt_server.core.exceptions import (
    ConflictError,
    NotFoundError,
    ValidationError,
)
from storage import build_blob_key, s3_client
from services.task import TaskService


class RepoService:
    """Service for repository lifecycle management."""

    def __init__(self, session: AsyncSession | None = None):
        """Initialize service with optional injected session.

        If session is provided, it will be used for all operations and
        will not be closed by this service. If not provided, a new
        session will be created per operation and managed internally.
        """
        self._session = session

    def _get_session(self) -> AsyncSession:
        """Get session to use for operations."""
        if self._session is not None:
            return self._session
        return get_session()

    def _is_owned(self, session: AsyncSession) -> bool:
        """Check if session was created by this service."""
        return session is not self._session

    # ------------------------------------------------------------------
    # Read helpers (used by routes)
    # ------------------------------------------------------------------

    async def get_profile_by_repo_id(self, repo_id: str):
        """Get repository profile by repo_id (without repo_type filter)."""
        session = self._get_session()
        own = self._is_owned(session)
        try:
            profile_repo = HfRepoProfileRepository(session)
            return await profile_repo.get_profile_by_repo_id(repo_id)
        finally:
            if own:
                await session.close()

    async def get_repo_detail(
        self,
        repo_id: str,
        repo_type: str,
    ) -> tuple:
        """Get repository detail with profile and snapshots.

        Returns:
            Tuple of (profile, snapshots, size_stats dict)
        """
        session = self._get_session()
        own = self._is_owned(session)
        try:
            profile_repo = HfRepoProfileRepository(session)
            snapshot_repo = HfRepoSnapshotRepository(session)

            profile, snapshots = await profile_repo.get_profile_with_snapshots(
                repo_id, repo_type=repo_type
            )

            size_stats = {}
            if snapshots:
                size_stats = await snapshot_repo.get_snapshot_size_stats(
                    [s.commit_hash for s in snapshots]
                )

            return profile, snapshots, size_stats
        finally:
            if own:
                await session.close()

    async def get_file_download_url(
        self,
        repo_id: str,
        commit_hash: str,
        path: str,
    ) -> str:
        """Get presigned S3 download URL for a cached file.

        Args:
            repo_id: Repository ID
            commit_hash: Commit hash of the snapshot
            path: File path within the repository

        Returns:
            Presigned S3 URL

        Raises:
            ValueError: If snapshot not found, file not found, or file not cached
        """
        session = self._get_session()
        own = self._is_owned(session)
        try:
            snapshot_repo = HfRepoSnapshotRepository(session)
            tree_repo = HfRepoTreeRepository(session)

            # Verify snapshot exists and get repo_type
            snapshots = await snapshot_repo.get_snapshots_by_commit(repo_id, commit_hash)
            if not snapshots:
                raise NotFoundError(
                    f"Snapshot with commit '{commit_hash}' not found for repository '{repo_id}'"
                )

            repo_type = snapshots[0].repo_type

            # Get tree item
            tree_item = await tree_repo.get_tree_item_by_path(commit_hash, path)
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
        finally:
            if own:
                await session.close()

    # ------------------------------------------------------------------
    # Delete orchestration (used by routes)
    # ------------------------------------------------------------------

    async def delete_repo(
        self,
        repo_id: str,
        hard: bool = False,
    ) -> dict:
        """Delete an entire cached repository with all pre-checks.

        Args:
            repo_id: Repository ID
            hard: If true, hard delete (remove all records). If false, soft delete.

        Returns:
            Deletion result dict

        Raises:
            ValueError: If repo not found, currently updating, or has active tasks
        """
        session = self._get_session()
        own = self._is_owned(session)
        try:
            profile_repo = HfRepoProfileRepository(session)
            profile = await profile_repo.get_profile_by_repo_id(repo_id)

            if profile is None:
                raise NotFoundError(f"Repository '{repo_id}' not found")

            if profile.status == RepoStatus.UPDATING:
                raise ConflictError(
                    f"Repository '{repo_id}' is currently being updated. "
                    "Please wait for the update to complete before deleting."
                )

            repo_type = profile.repo_type

            # Check active download tasks
            task_service = TaskService()
            if await task_service.has_active_download_task(repo_id):
                raise ConflictError(
                    f"Repository {repo_id} has active download tasks. "
                    "Please wait for downloads to complete before deleting."
                )

            # Execute deletion
            if hard:
                result = await self._hard_delete_repository(session, repo_id, repo_type)
            else:
                result = await self._delete_repository(session, repo_id, repo_type)

            if own:
                await session.commit()
            return result
        except Exception:
            if own:
                await session.rollback()
            raise
        finally:
            if own:
                await session.close()

    # ------------------------------------------------------------------
    # Internal delete implementations (shared by delete_repo and legacy callers)
    # ------------------------------------------------------------------

    async def _delete_repository(
        self,
        session: AsyncSession,
        repo_id: str,
        repo_type: str,
    ) -> dict:
        """Soft delete repository core logic."""
        profile_repo = HfRepoProfileRepository(session)
        snapshot_repo = HfRepoSnapshotRepository(session)
        tree_repo = HfRepoTreeRepository(session)

        await profile_repo.set_profile_status(repo_id, repo_type, RepoStatus.CLEANING)

        snapshots = await snapshot_repo.get_all_snapshots(repo_id)

        if not snapshots:
            await profile_repo.soft_delete_profile(repo_id, repo_type)
            return {
                "deleted": True,
                "repo_id": repo_id,
                "snapshots_deleted": 0,
                "blobs_deleted": 0,
                "blobs_failed": 0,
                "message": f"No snapshots found for {repo_id}, profile marked as cleaned",
            }

        logger.info("Deleting {} snapshots for {}", len(snapshots), repo_id)

        all_blob_ids: set[str] = set()
        for snapshot in snapshots:
            blob_ids = await tree_repo.get_blob_ids_by_snapshot(snapshot.commit_hash)
            all_blob_ids.update(blob_ids)

        logger.info("Found {} unique blobs to delete for {}", len(all_blob_ids), repo_id)

        deleted_blobs = 0
        failed_blobs: list[str] = []
        for blob_id in all_blob_ids:
            s3_key = build_blob_key(repo_id, repo_type, blob_id)
            try:
                await s3_client.delete_file(s3_key)
                deleted_blobs += 1
            except Exception as e:
                logger.error("Failed to delete blob {}: {}", blob_id[:12], e)
                failed_blobs.append(blob_id)

        for snapshot in snapshots:
            await snapshot_repo.delete_snapshot(snapshot.commit_hash)

        await profile_repo.soft_delete_profile(repo_id, repo_type)

        return {
            "deleted": True,
            "repo_id": repo_id,
            "snapshots_deleted": len(snapshots),
            "blobs_deleted": deleted_blobs,
            "blobs_failed": len(failed_blobs),
        }

    async def _hard_delete_repository(
        self,
        session: AsyncSession,
        repo_id: str,
        repo_type: str,
    ) -> dict:
        """Hard delete repository core logic."""
        profile_repo = HfRepoProfileRepository(session)
        snapshot_repo = HfRepoSnapshotRepository(session)
        tree_repo = HfRepoTreeRepository(session)

        await profile_repo.set_profile_status(repo_id, repo_type, RepoStatus.CLEANING)

        snapshots = await snapshot_repo.get_all_snapshots(repo_id)

        if not snapshots:
            profile_deleted = await profile_repo.delete_profile(repo_id, repo_type)
            return {
                "deleted": True,
                "repo_id": repo_id,
                "snapshots_deleted": 0,
                "tree_items_deleted": 0,
                "blobs_deleted": 0,
                "blobs_failed": 0,
                "profile_deleted": profile_deleted,
            }

        logger.info("Hard deleting {} snapshots for {}", len(snapshots), repo_id)

        all_blob_ids: set[str] = set()
        for snapshot in snapshots:
            blob_ids = await tree_repo.get_blob_ids_by_snapshot(snapshot.commit_hash)
            all_blob_ids.update(blob_ids)

        logger.info("Found {} unique blobs to delete for {}", len(all_blob_ids), repo_id)

        deleted_blobs = 0
        failed_blobs: list[str] = []
        for blob_id in all_blob_ids:
            s3_key = build_blob_key(repo_id, repo_type, blob_id)
            try:
                await s3_client.delete_file(s3_key)
                deleted_blobs += 1
            except Exception as e:
                logger.error("Failed to delete blob {}: {}", blob_id[:12], e)
                failed_blobs.append(blob_id)

        tree_items_deleted = 0
        for snapshot in snapshots:
            count = await tree_repo.delete_items_by_snapshot(snapshot.commit_hash)
            tree_items_deleted += count

        for snapshot in snapshots:
            await snapshot_repo.delete_snapshot(snapshot.commit_hash)

        profile_deleted = await profile_repo.delete_profile(repo_id, repo_type)

        return {
            "deleted": True,
            "repo_id": repo_id,
            "snapshots_deleted": len(snapshots),
            "tree_items_deleted": tree_items_deleted,
            "blobs_deleted": deleted_blobs,
            "blobs_failed": len(failed_blobs),
            "profile_deleted": profile_deleted,
        }

    # ------------------------------------------------------------------
    # Legacy public methods (maintain backward compat for worker/task callers)
    # ------------------------------------------------------------------

    async def check_cached_status(
        self,
        repo_id: str,
        repo_type: str,
        revision: str,
        required_file_paths: set[str],
    ) -> tuple[bool, str | None]:
        """Check if all required files are already cached for a repository revision."""
        session = self._get_session()
        own = self._is_owned(session)
        try:
            snapshot_repo = HfRepoSnapshotRepository(session)
            active_snapshot = await snapshot_repo.get_active_snapshot(
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
            )

            if not active_snapshot:
                return False, None

            tree_repo = HfRepoTreeRepository(session)
            cached_paths = await tree_repo.get_cached_paths(
                active_snapshot.commit_hash
            )

            all_cached = required_file_paths.issubset(cached_paths)
            return all_cached, active_snapshot.commit_hash
        except Exception:
            logger.exception(
                "Failed to check cache status for {}@{} {}",
                repo_id,
                revision,
                repo_type,
            )
            return False, None
        finally:
            if own:
                await session.close()

    async def delete_repository(
        self,
        repo_id: str,
        repo_type: str,
    ) -> dict:
        """Soft delete an entire repository (legacy entrypoint)."""
        session = self._get_session()
        own = self._is_owned(session)
        try:
            result = await self._delete_repository(session, repo_id, repo_type)
            if own:
                await session.commit()
            return result
        except Exception:
            if own:
                await session.rollback()
            raise
        finally:
            if own:
                await session.close()

    async def hard_delete_repository(
        self,
        repo_id: str,
        repo_type: str,
    ) -> dict:
        """Hard delete an entire repository (legacy entrypoint)."""
        session = self._get_session()
        own = self._is_owned(session)
        try:
            result = await self._hard_delete_repository(session, repo_id, repo_type)
            if own:
                await session.commit()
            return result
        except Exception:
            if own:
                await session.rollback()
            raise
        finally:
            if own:
                await session.close()
