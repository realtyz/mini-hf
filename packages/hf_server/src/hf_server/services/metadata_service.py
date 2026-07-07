import re

from sqlalchemy.ext.asyncio import AsyncSession

from database.db_models import HfRepoProfile, HfRepoSnapshot, HfRepoTreeItem
from database.db_repositories import (
    HfRepoProfileRepository,
    HfRepoSnapshotRepository,
    HfRepoTreeRepository,
)

# Regex to match commit hash (40 hex characters)
REGEX_COMMIT_HASH = re.compile(r"^[0-9a-f]{40}$")


class MetadataService:
    """Service for metadata operations.

    Thin orchestration layer over the snapshot/tree/profile repositories.
    Routes call this; SQL lives in the repositories.
    """

    def __init__(self, db: AsyncSession):
        self._snapshot_repo = HfRepoSnapshotRepository(db)
        self._tree_repo = HfRepoTreeRepository(db)
        self._profile_repo = HfRepoProfileRepository(db)

    async def get_model_info(
        self,
        namespace: str,
        repo_name: str,
        revision: str,
    ) -> HfRepoSnapshot | None:
        """Get model snapshot by namespace, repo_name and revision.

        Returns the latest snapshot for the revision regardless of status, so
        partially-downloaded repositories (status != ACTIVE) remain reachable.
        """
        repo_id = f"{namespace}/{repo_name}"
        return await self._snapshot_repo.get_latest_snapshot_by_revision(
            repo_id, "model", revision
        )

    async def get_dataset_info(
        self,
        namespace: str,
        repo_name: str,
        revision: str,
    ) -> HfRepoSnapshot | None:
        """Get dataset snapshot by namespace, repo_name and revision.

        Returns the latest snapshot for the revision regardless of status, so
        partially-downloaded repositories (status != ACTIVE) remain reachable.
        """
        repo_id = f"{namespace}/{repo_name}"
        return await self._snapshot_repo.get_latest_snapshot_by_revision(
            repo_id, "dataset", revision
        )

    async def get_snapshot_by_repo_and_rev(
        self,
        repo_id: str,
        repo_type: str,
        rev: str,
    ) -> HfRepoSnapshot | None:
        """Get snapshot by repo_id, repo_type and rev.

        For both revision names and commit hashes, returns the latest matching
        snapshot regardless of status. Partially-downloaded snapshots remain
        reachable; per-file completeness is enforced downstream by the S3
        existence check in the resolve endpoint.

        Args:
            repo_id: Repository ID (e.g., "facebook/bart-large")
            repo_type: Repository type ("model" or "dataset")
            rev: Revision (can be tag/branch name or commit hash)

        Returns:
            RepoSnapshot instance or None if not found
        """
        if REGEX_COMMIT_HASH.match(rev):
            return await self._snapshot_repo.get_snapshot_by_commit(
                repo_id, repo_type, rev
            )
        return await self._snapshot_repo.get_latest_snapshot_by_revision(
            repo_id, repo_type, rev
        )

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
        return await self._tree_repo.get_tree_item_by_path(commit_hash, file_path)

    async def get_repo_tree_paginated(
        self,
        commit_hash: str,
        cursor_path: str | None,
        limit: int,
    ) -> list[HfRepoTreeItem]:
        """Get a page of tree items using cursor-based pagination on path.

        Caller is responsible for fetching limit+1 to detect a next page and
        for trimming the extra item. See HfRepoTreeRepository.get_tree_by_cursor
        for why the sort is path-only.
        """
        return await self._tree_repo.get_tree_by_cursor(
            commit_hash, cursor_path, limit
        )

    async def get_profile(
        self,
        repo_id: str,
        repo_type: str,
    ) -> HfRepoProfile | None:
        """Get repository profile by repo_id and repo_type."""
        return await self._profile_repo.get_profile(repo_id, repo_type)

    async def increment_downloads(
        self,
        repo_id: str,
        repo_type: str,
    ) -> bool:
        """Increment the downloads counter for a repository.

        Returns True if the profile was found and updated, False otherwise.
        """
        return await self._profile_repo.increment_downloads(repo_id, repo_type)
