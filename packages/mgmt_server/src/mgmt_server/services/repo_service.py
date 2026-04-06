"""Repository management service for delete operations."""

from loguru import logger

from database import get_session
from database.db_repositories import (
    HfRepoProfileRepository,
    HfRepoSnapshotRepository,
    HfRepoTreeRepository,
)
from database.db_models import RepoStatus
from storage import build_blob_key, s3_client


class RepoService:
    """Service for repository lifecycle management."""

    async def check_cached_status(
        self,
        repo_id: str,
        repo_type: str,
        revision: str,
        required_file_paths: set[str],
    ) -> tuple[bool, str | None]:
        """Check if all required files are already cached for a repository revision.

        Args:
            repo_id: Repository ID
            repo_type: Repository type ("model" or "dataset")
            revision: Revision (branch/tag name)
            required_file_paths: Set of file paths that need to be checked

        Returns:
            Tuple of (all_cached, cached_commit_hash) where:
            - all_cached: True if all required files are cached, False otherwise
            - cached_commit_hash: The commit hash of the active snapshot if found, None otherwise
        """
        session = get_session()
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

            # Check if all required files are cached
            all_cached = required_file_paths.issubset(cached_paths)
            return all_cached, active_snapshot.commit_hash
        except Exception:
            logger.exception("Failed to check cache status for {}@{} {}", repo_id, revision, repo_type)
            return False, None
        finally:
            await session.close()

    async def delete_repository(
        self,
        repo_id: str,
        repo_type: str,
    ) -> dict:
        """Delete an entire repository and all its blobs from S3.

        This method performs synchronous deletion of repository data:
        1. Sets profile status to CLEANING
        2. Fetches all snapshots for the repository
        3. Collects all blob IDs from all snapshots
        4. Deletes all blobs from S3 directly (no reference counting)
        5. Deletes database records
        6. Deletes the repository profile

        Args:
            repo_id: Repository ID
            repo_type: Repository type ("model" or "dataset")

        Returns:
            Dict with deletion results
        """
        session = get_session()
        try:
            profile_repo = HfRepoProfileRepository(session)
            snapshot_repo = HfRepoSnapshotRepository(session)
            tree_repo = HfRepoTreeRepository(session)

            # 1. Set profile status to CLEANING before deletion
            await profile_repo.set_profile_status(repo_id, repo_type, RepoStatus.CLEANING)

            # 2. Get all snapshots for this repository
            snapshots = await snapshot_repo.get_all_snapshots(repo_id)

            if not snapshots:
                # No snapshots to delete, just soft delete the profile
                await profile_repo.soft_delete_profile(repo_id, repo_type)
                await session.commit()
                return {
                    "deleted": True,
                    "repo_id": repo_id,
                    "snapshots_deleted": 0,
                    "blobs_deleted": 0,
                    "blobs_failed": 0,
                    "message": f"No snapshots found for {repo_id}, profile marked as cleaned",
                }

            logger.info(
                "Deleting {} snapshots for {}",
                len(snapshots),
                repo_id,
            )

            # 3. Collect all unique blob IDs from all snapshots
            all_blob_ids: set[str] = set()
            for snapshot in snapshots:
                blob_ids = await tree_repo.get_blob_ids_by_snapshot(
                    snapshot.commit_hash
                )
                all_blob_ids.update(blob_ids)

            logger.info(
                "Found {} unique blobs to delete for {}",
                len(all_blob_ids),
                repo_id,
            )

            # 4. Delete all blobs from S3 directly (no reference counting)
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

            # 5. Delete all database records (snapshots and tree items)
            for snapshot in snapshots:
                await snapshot_repo.delete_snapshot(snapshot.commit_hash)

            # 6. Soft delete: set profile to CLEANED with cleared cached_commits
            # preserve downloads, first_cached_at, cache_updated_at
            await profile_repo.soft_delete_profile(repo_id, repo_type)

            await session.commit()

            return {
                "deleted": True,
                "repo_id": repo_id,
                "snapshots_deleted": len(snapshots),
                "blobs_deleted": deleted_blobs,
                "blobs_failed": len(failed_blobs),
            }

        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
