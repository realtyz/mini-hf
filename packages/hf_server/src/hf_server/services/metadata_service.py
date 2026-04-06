import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.db_models.hf_metadata import HfRepoSnapshot, HfRepoTreeItem, SnapshotStatus

# Regex to match commit hash (40 hex characters)
REGEX_COMMIT_HASH = re.compile(r"^[0-9a-f]{40}$")


class MetadataService:
    """Service for metadata operations."""

    def __init__(self, db: AsyncSession):
        self._db = db

    async def get_model_info(
        self,
        namespace: str,
        repo_name: str,
        revision: str,
    ) -> HfRepoSnapshot | None:
        """Get model snapshot by namespace, repo_name and revision.

        Only returns ACTIVE snapshots (each revision only has one active commit).
        """
        repo_id = f"{namespace}/{repo_name}"

        stmt = select(HfRepoSnapshot).where(
            HfRepoSnapshot.repo_id == repo_id,
            HfRepoSnapshot.repo_type == "model",
            HfRepoSnapshot.revision == revision,
            HfRepoSnapshot.status == SnapshotStatus.ACTIVE,
        )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_dataset_info(
        self,
        namespace: str,
        repo_name: str,
        revision: str,
    ) -> HfRepoSnapshot | None:
        """Get dataset snapshot by namespace, repo_name and revision.

        Only returns ACTIVE snapshots (each revision only has one active commit).
        """
        repo_id = f"{namespace}/{repo_name}"

        stmt = select(HfRepoSnapshot).where(
            HfRepoSnapshot.repo_id == repo_id,
            HfRepoSnapshot.repo_type == "dataset",
            HfRepoSnapshot.revision == revision,
            HfRepoSnapshot.status == SnapshotStatus.ACTIVE,
        )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_snapshot_by_repo_and_rev(
        self,
        repo_id: str,
        repo_type: str,
        rev: str,
    ) -> HfRepoSnapshot | None:
        """Get snapshot by repo_id, repo_type and rev.

        For revision (tag/branch name), only returns ACTIVE snapshots.
        For commit hash, searches all snapshots (to support direct commit access).

        Args:
            repo_id: Repository ID (e.g., "facebook/bart-large")
            repo_type: Repository type ("model" or "dataset")
            rev: Revision (can be tag/branch name or commit hash)

        Returns:
            RepoSnapshot instance or None if not found
        """
        # Check if rev is a commit hash (40 hex characters)
        if REGEX_COMMIT_HASH.match(rev):
            # Query by commit_hash - search all snapshots for direct commit access
            stmt = select(HfRepoSnapshot).where(
                HfRepoSnapshot.repo_id == repo_id,
                HfRepoSnapshot.repo_type == repo_type,
                HfRepoSnapshot.commit_hash == rev,
            )
        else:
            # Query by revision (tag/branch name) - only return ACTIVE snapshots
            stmt = select(HfRepoSnapshot).where(
                HfRepoSnapshot.repo_id == repo_id,
                HfRepoSnapshot.repo_type == repo_type,
                HfRepoSnapshot.revision == rev,
                HfRepoSnapshot.status == SnapshotStatus.ACTIVE,
            )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_tree_item(
        self,
        commit_hash: str,
        file_path: str,
    ) -> HfRepoTreeItem | None:
        """Get tree item by commit_hash and file path.

        Args:
            commit_hash: Commit hash
            file_path: File path within the repository

        Returns:
            RepoTreeItem instance or None if not found
        """
        stmt = select(HfRepoTreeItem).where(
            HfRepoTreeItem.commit_hash == commit_hash,
            HfRepoTreeItem.path == file_path,
        )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()
