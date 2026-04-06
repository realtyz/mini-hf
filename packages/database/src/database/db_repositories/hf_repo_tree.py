"""Repository for HuggingFace repository tree item operations."""

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from database.db_models import (
    HfRepoSnapshot,
    HfRepoTreeItem,
    SnapshotStatus,
    TreeItemType,
)


class HfRepoTreeRepository:
    """Repository for HfRepoTreeItem entity operations.

    This repository handles all database operations related to repository tree items,
    including batch inserts, queries, and cache status updates.
    """

    def __init__(self, session: AsyncSession):
        self._session = session

    async def batch_insert_items(
        self,
        commit_hash: str,
        items: list[dict],
    ) -> int:
        """Batch insert tree items with upsert (ON CONFLICT DO NOTHING).

        Uses PostgreSQL's ON CONFLICT to handle duplicate (commit_hash, path) pairs,
        ensuring idempotency when the same tree is saved multiple times.

        Args:
            commit_hash: Commit hash for the snapshot
            items: List of item dicts with keys: path, item_type, size, oid, lfs_oid, lfs_size, lfs_pointer_size, xet_hash

        Returns:
            Number of items actually inserted (excluding duplicates)
        """
        if not items:
            return 0

        # Build values for bulk insert
        values = []
        for item in items:
            item_type = TreeItemType(item["item_type"])
            # 根据类型设置 is_cached 默认值: directory=None, file=False
            is_cached = None if item_type == TreeItemType.DIRECTORY else False

            value = {
                "commit_hash": commit_hash,
                "type": item_type.value,
                "path": item["path"],
                "size": item.get("size", 0),
                "oid": item.get("oid"),
                "is_cached": is_cached,
                "lfs_oid": item.get("lfs_oid"),
                "lfs_size": item.get("lfs_size"),
                "lfs_pointer_size": item.get("lfs_pointer_size"),
                "xet_hash": item.get("xet_hash"),
            }
            values.append(value)

        # Use INSERT ... ON CONFLICT DO NOTHING for upsert
        stmt = insert(HfRepoTreeItem).values(values)
        stmt = stmt.on_conflict_do_nothing(
            constraint="uq_hf_repo_tree_items_commit_path"
        )
        result = await self._session.execute(stmt)
        await self._session.commit()
        return result.rowcount  # type: ignore[attr-defined]

    async def get_file_tree(
        self,
        commit_hash: str,
    ) -> list[HfRepoTreeItem]:
        """Get all tree items for a snapshot.

        Args:
            commit_hash: Commit hash of the snapshot

        Returns:
            List of tree items (files and directories)
        """
        stmt = (
            select(HfRepoTreeItem)
            .where(HfRepoTreeItem.commit_hash == commit_hash)
            .order_by(HfRepoTreeItem.type.asc(), HfRepoTreeItem.path.asc())
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_file_tree_paginated(
        self,
        commit_hash: str,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[HfRepoTreeItem], int]:
        """Get paginated tree items for a snapshot.

        Args:
            commit_hash: Commit hash of the snapshot
            page: Page number (1-based)
            page_size: Items per page

        Returns:
            Tuple of (list of tree items, total count)
        """
        # Get total count
        count_stmt = select(func.count()).select_from(
            select(HfRepoTreeItem)
            .where(HfRepoTreeItem.commit_hash == commit_hash)
            .subquery()
        )
        count_result = await self._session.execute(count_stmt)
        total = count_result.scalar() or 0

        # Get paginated items
        offset = (page - 1) * page_size
        stmt = (
            select(HfRepoTreeItem)
            .where(HfRepoTreeItem.commit_hash == commit_hash)
            .order_by(
                # Directories first, then files
                HfRepoTreeItem.type.asc(),
                HfRepoTreeItem.path.asc(),
            )
            .offset(offset)
            .limit(page_size)
        )
        result = await self._session.execute(stmt)
        items = list(result.scalars().all())

        return items, total

    async def set_item_cached(
        self,
        commit_hash: str,
        path: str,
    ) -> bool:
        """Set is_cached to True for a tree item.

        Args:
            commit_hash: Commit hash of the snapshot
            path: Path of the tree item

        Returns:
            True if item was found and updated, False otherwise
        """
        stmt = (
            update(HfRepoTreeItem)
            .where(
                HfRepoTreeItem.commit_hash == commit_hash,
                HfRepoTreeItem.path == path,
            )
            .values(is_cached=True)
        )
        result = await self._session.execute(stmt)
        await self._session.commit()
        return result.rowcount > 0  # type: ignore[attr-defined]

    async def get_blob_ids_by_snapshot(
        self,
        commit_hash: str,
    ) -> list[str]:
        """Get all blob IDs (oid) for files in a snapshot.

        For LFS files, returns lfs_oid instead of oid.
        """
        stmt = select(
            HfRepoTreeItem.lfs_oid,
            HfRepoTreeItem.oid,
        ).where(
            HfRepoTreeItem.commit_hash == commit_hash,
            HfRepoTreeItem.type == TreeItemType.FILE,
        )
        result = await self._session.execute(stmt)

        blob_ids = []
        for lfs_oid, oid in result.all():
            # Use lfs_oid for LFS files, otherwise use oid
            blob_id = lfs_oid if lfs_oid else oid
            if blob_id:
                blob_ids.append(blob_id)
        return blob_ids

    async def blob_exists_in_other_active_commits(
        self,
        repo_id: str,
        blob_id: str,
        exclude_commit_hash: str,
    ) -> bool:
        """Check if a blob is used by any other active snapshot.

        Args:
            repo_id: Repository ID
            blob_id: Blob ID (oid or lfs_oid)
            exclude_commit_hash: Commit hash to exclude from check

        Returns:
            True if blob is used by another active snapshot, False otherwise
        """
        stmt = (
            select(func.count())
            .select_from(HfRepoTreeItem)
            .join(
                HfRepoSnapshot,
                HfRepoSnapshot.commit_hash == HfRepoTreeItem.commit_hash,
            )
            .where(
                HfRepoSnapshot.repo_id == repo_id,
                HfRepoSnapshot.commit_hash != exclude_commit_hash,
                HfRepoSnapshot.status == SnapshotStatus.ACTIVE,
                HfRepoTreeItem.type == TreeItemType.FILE,
                or_(
                    HfRepoTreeItem.oid == blob_id,
                    HfRepoTreeItem.lfs_oid == blob_id,
                ),
            )
        )
        result = await self._session.execute(stmt)
        count = result.scalar() or 0
        return count > 0

    async def delete_items_by_snapshot(
        self,
        commit_hash: str,
    ) -> int:
        """Delete all tree items for a snapshot.

        Args:
            commit_hash: Commit hash of the snapshot

        Returns:
            Number of items deleted
        """
        result = await self._session.execute(
            delete(HfRepoTreeItem).where(HfRepoTreeItem.commit_hash == commit_hash)
        )
        await self._session.commit()
        return result.rowcount  # type: ignore[attr-defined]

    async def get_cached_files_count(
        self,
        commit_hash: str,
    ) -> tuple[int, int]:
        """Get count of cached and total files for a snapshot.

        Args:
            commit_hash: Commit hash of the snapshot

        Returns:
            Tuple of (cached_count, total_count)
        """
        # Total files
        total_stmt = select(func.count()).where(
            HfRepoTreeItem.commit_hash == commit_hash,
            HfRepoTreeItem.type == TreeItemType.FILE,
        )
        total_result = await self._session.execute(total_stmt)
        total = total_result.scalar() or 0

        # Cached files
        cached_stmt = select(func.count()).where(
            HfRepoTreeItem.commit_hash == commit_hash,
            HfRepoTreeItem.type == TreeItemType.FILE,
            HfRepoTreeItem.is_cached == True,  # noqa: E712
        )
        cached_result = await self._session.execute(cached_stmt)
        cached = cached_result.scalar() or 0

        return cached, total

    async def get_cached_paths(
        self,
        commit_hash: str,
    ) -> set[str]:
        """Get set of cached file paths for a snapshot.

        Args:
            commit_hash: Commit hash of the snapshot

        Returns:
            Set of paths that are cached (is_cached=True)
        """
        stmt = select(HfRepoTreeItem.path).where(
            HfRepoTreeItem.commit_hash == commit_hash,
            HfRepoTreeItem.type == TreeItemType.FILE,
            HfRepoTreeItem.is_cached == True,  # noqa: E712
        )
        result = await self._session.execute(stmt)
        return {row[0] for row in result.all()}
