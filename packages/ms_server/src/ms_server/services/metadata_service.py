import re

from sqlalchemy.ext.asyncio import AsyncSession

from database.db_models import MsRepoProfile, MsRepoSnapshot, MsRepoTreeItem
from database.db_repositories import (
    MsRepoProfileRepository,
    MsRepoSnapshotRepository,
    MsRepoTreeRepository,
)

# Regex to match commit hash (40 hex characters)
REGEX_COMMIT_HASH = re.compile(r"^[0-9a-f]{40}$")


class MsMetadataService:
    """Service for ModelScope metadata operations.

    Thin orchestration layer over the MsRepo* repositories. Routes call
    this; SQL lives in the repositories. Mirrors ``MetadataService`` in
    ``hf_server`` but operates on the ModelScope table set and adds file
    tree listing helpers for the ModelScope Legacy API endpoints.
    """

    def __init__(self, db: AsyncSession):
        self._snapshot_repo = MsRepoSnapshotRepository(db)
        self._tree_repo = MsRepoTreeRepository(db)
        self._profile_repo = MsRepoProfileRepository(db)

    async def get_snapshot_by_repo_and_rev(
        self, repo_id: str, repo_type: str, rev: str
    ) -> MsRepoSnapshot | None:
        """Get snapshot by repo_id, repo_type and rev.

        For both revision names and commit hashes, returns the latest matching
        snapshot regardless of status. Partially-downloaded snapshots remain
        reachable; per-file completeness is enforced downstream by the S3
        existence check in the download endpoint.

        Args:
            repo_id: Repository ID (e.g., "Qwen/Qwen3-0.6B")
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
        self, commit_hash: str, file_path: str
    ) -> MsRepoTreeItem | None:
        """Get tree item by commit_hash and file path.

        Args:
            commit_hash: Commit hash
            file_path: File path within the repository

        Returns:
            RepoTreeItem instance or None if not found
        """
        return await self._tree_repo.get_tree_item_by_path(commit_hash, file_path)

    async def get_file_tree(self, commit_hash: str) -> list[MsRepoTreeItem]:
        """Get all tree items for a snapshot."""
        return await self._tree_repo.get_file_tree(commit_hash)

    async def get_file_tree_paginated(
        self, commit_hash: str, page: int, page_size: int
    ) -> tuple[list[MsRepoTreeItem], int]:
        """Get paginated tree items for a snapshot.

        Returns:
            Tuple of (list of tree items, total count)
        """
        return await self._tree_repo.get_file_tree_paginated(
            commit_hash, page, page_size
        )

    async def get_file_tree_filtered(
        self, commit_hash: str, root: str | None
    ) -> list[MsRepoTreeItem]:
        """Get all tree items for a snapshot, optionally narrowed to a sub-path.

        Fetches the full tree and filters in memory by ``root`` prefix. When
        ``root`` is falsy, returns the unfiltered tree.
        """
        items = await self._tree_repo.get_file_tree(commit_hash)
        if not root:
            return items
        prefix = root.rstrip("/") + "/"
        return [it for it in items if it.path == root or it.path.startswith(prefix)]

    async def get_profile(
        self, repo_id: str, repo_type: str
    ) -> MsRepoProfile | None:
        """Get repository profile by repo_id and repo_type."""
        return await self._profile_repo.get_profile(repo_id, repo_type)

    async def increment_downloads(self, repo_id: str, repo_type: str) -> bool:
        """Increment the downloads counter for a repository.

        Returns True if the profile was found and updated, False otherwise.
        """
        return await self._profile_repo.increment_downloads(repo_id, repo_type)
