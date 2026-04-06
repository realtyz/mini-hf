"""Repository for HuggingFace repository snapshot operations."""

from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database.db_models import HfRepoSnapshot, SnapshotStatus


class HfRepoSnapshotRepository:
    """Repository for HfRepoSnapshot entity operations.

    This repository handles all database operations related to repository snapshots,
    including creation, activation, archival, and queries.
    """

    def __init__(self, session: AsyncSession):
        self._session = session

    async def get_snapshot_by_repo(
        self,
        repo_id: str,
        repo_type: str,
        revision: str,
        commit_hash: str,
    ) -> HfRepoSnapshot | None:
        """Get snapshot by repo, revision and commit hash."""
        stmt = select(HfRepoSnapshot).where(
            HfRepoSnapshot.repo_id == repo_id,
            HfRepoSnapshot.repo_type == repo_type,
            HfRepoSnapshot.revision == revision,
            HfRepoSnapshot.commit_hash == commit_hash,
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_or_create_snapshot(
        self,
        repo_id: str,
        repo_type: str,
        revision: str,
        commit_hash: str,
        committed_at: datetime | None = None,
        initial_status: SnapshotStatus | None = None,
    ) -> tuple[HfRepoSnapshot, bool]:
        """Get existing snapshot or create new one.

        Args:
            repo_id: Repository ID
            repo_type: Repository type (model/dataset)
            revision: Revision (branch/tag name)
            commit_hash: Commit hash
            committed_at: Commit timestamp
            initial_status: Initial status for new snapshot (default: INACTIVE)

        Returns:
            Tuple of (snapshot, is_new) where is_new indicates if a new snapshot was created
        """
        # First check if this exact (revision, commit_hash) combination exists
        existing = await self.get_snapshot_by_repo(
            repo_id, repo_type, revision, commit_hash
        )
        if existing:
            return existing, False

        # 处理带时区的 datetime - 转换为无时区（假设 UTC）
        if committed_at is not None and committed_at.tzinfo is not None:
            committed_at = committed_at.replace(tzinfo=None)

        # Create new snapshot with specified initial status (default: INACTIVE)
        status = (
            initial_status if initial_status is not None else SnapshotStatus.INACTIVE
        )
        snapshot = HfRepoSnapshot(
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
            commit_hash=commit_hash,
            committed_at=committed_at,
            status=status,
        )
        self._session.add(snapshot)
        await self._session.commit()
        return snapshot, True

    async def get_active_snapshot(
        self,
        repo_id: str,
        repo_type: str,
        revision: str,
    ) -> HfRepoSnapshot | None:
        """Get the active snapshot for a revision.

        Each revision can only have one ACTIVE snapshot at a time.

        Args:
            repo_id: Repository ID
            repo_type: Repository type (model/dataset)
            revision: Revision (branch/tag name)

        Returns:
            Active snapshot or None if not found
        """
        stmt = select(HfRepoSnapshot).where(
            HfRepoSnapshot.repo_id == repo_id,
            HfRepoSnapshot.repo_type == repo_type,
            HfRepoSnapshot.revision == revision,
            HfRepoSnapshot.status == SnapshotStatus.ACTIVE,
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def activate_snapshot(
        self,
        repo_id: str,
        repo_type: str,
        revision: str,
        commit_hash: str,
    ) -> HfRepoSnapshot | None:
        """Activate a snapshot by changing status from INACTIVE to ACTIVE.

        Args:
            repo_id: Repository ID
            repo_type: Repository type (model/dataset)
            revision: Revision (branch/tag name)
            commit_hash: Commit hash of the snapshot to activate

        Returns:
            The activated snapshot or None if not found
        """
        stmt = select(HfRepoSnapshot).where(
            HfRepoSnapshot.repo_id == repo_id,
            HfRepoSnapshot.repo_type == repo_type,
            HfRepoSnapshot.revision == revision,
            HfRepoSnapshot.commit_hash == commit_hash,
            HfRepoSnapshot.status == SnapshotStatus.INACTIVE,
        )
        result = await self._session.execute(stmt)
        snapshot = result.scalar_one_or_none()

        if snapshot:
            snapshot.status = SnapshotStatus.ACTIVE
            await self._session.commit()

        return snapshot

    async def archive_snapshot(
        self,
        repo_id: str,
        repo_type: str,
        revision: str,
        archive_commit_hash: str | None = None,
    ) -> HfRepoSnapshot | None:
        """Archive the current active snapshot for a revision.

        Changes the status from ACTIVE to ARCHIVED.

        Args:
            repo_id: Repository ID
            repo_type: Repository type (model/dataset)
            revision: Revision (branch/tag name)
            archive_commit_hash: If provided, only archive this specific commit hash

        Returns:
            The archived snapshot or None if no active snapshot found
        """
        stmt = select(HfRepoSnapshot).where(
            HfRepoSnapshot.repo_id == repo_id,
            HfRepoSnapshot.repo_type == repo_type,
            HfRepoSnapshot.revision == revision,
            HfRepoSnapshot.status == SnapshotStatus.ACTIVE,
        )
        if archive_commit_hash:
            stmt = stmt.where(HfRepoSnapshot.commit_hash == archive_commit_hash)

        result = await self._session.execute(stmt)
        snapshot = result.scalar_one_or_none()

        if snapshot:
            snapshot.status = SnapshotStatus.ARCHIVED
            await self._session.commit()

        return snapshot

    async def get_snapshots_by_commit(
        self,
        repo_id: str,
        commit_hash: str,
    ) -> list[HfRepoSnapshot]:
        """Get snapshots by repo_id and commit_hash."""
        stmt = select(HfRepoSnapshot).where(
            HfRepoSnapshot.repo_id == repo_id,
            HfRepoSnapshot.commit_hash == commit_hash,
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_all_snapshots(
        self,
        repo_id: str,
    ) -> list[HfRepoSnapshot]:
        """Get all snapshots for a repository."""
        stmt = select(HfRepoSnapshot).where(
            HfRepoSnapshot.repo_id == repo_id,
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_snapshots_by_revision(
        self,
        repo_id: str,
        repo_type: str,
        revision: str,
    ) -> list[HfRepoSnapshot]:
        """Get all snapshots for a specific revision."""
        stmt = (
            select(HfRepoSnapshot)
            .where(
                HfRepoSnapshot.repo_id == repo_id,
                HfRepoSnapshot.repo_type == repo_type,
                HfRepoSnapshot.revision == revision,
            )
            .order_by(HfRepoSnapshot.created_at.desc())
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def delete_snapshot(
        self,
        commit_hash: str,
    ) -> None:
        """Delete snapshot and all its tree items.

        Note: Tree items should be deleted separately or via cascade.
        """
        # Delete snapshot (tree items should be handled separately)
        await self._session.execute(
            delete(HfRepoSnapshot).where(HfRepoSnapshot.commit_hash == commit_hash)
        )
        await self._session.commit()

    async def get_snapshot_size_stats(
        self,
        commit_hashes: list[str],
    ) -> dict[str, tuple[int, int]]:
        """Return (total_size, cached_size) for each commit_hash.

        Args:
            commit_hashes: List of commit hashes to query

        Returns:
            Dict mapping commit_hash -> (total_size, cached_size) in bytes
        """
        from sqlalchemy import case

        from database.db_models import HfRepoTreeItem

        if not commit_hashes:
            return {}

        stmt = (
            select(
                HfRepoTreeItem.commit_hash,
                func.coalesce(func.sum(HfRepoTreeItem.size), 0).label("total_size"),
                func.coalesce(
                    func.sum(
                        case(
                            (HfRepoTreeItem.is_cached == True, HfRepoTreeItem.size),  # noqa: E712
                            else_=0,
                        )
                    ),
                    0,
                ).label("cached_size"),
            )
            .where(HfRepoTreeItem.commit_hash.in_(commit_hashes))
            .group_by(HfRepoTreeItem.commit_hash)
        )
        result = await self._session.execute(stmt)
        return {
            row.commit_hash: (int(row.total_size), int(row.cached_size))
            for row in result.all()
        }

    async def get_repo_with_snapshots(
        self,
        repo_id: str,
        repo_type: str,
    ) -> tuple[list[HfRepoSnapshot], int]:
        """Get all snapshots for a repository with total count.

        Args:
            repo_id: Repository ID
            repo_type: Repository type (model/dataset)

        Returns:
            Tuple of (list of snapshots, total count)
        """
        # Get total count
        count_stmt = select(func.count()).select_from(
            select(HfRepoSnapshot)
            .where(
                HfRepoSnapshot.repo_id == repo_id,
                HfRepoSnapshot.repo_type == repo_type,
            )
            .subquery()
        )
        count_result = await self._session.execute(count_stmt)
        total = count_result.scalar() or 0

        # Get snapshots
        snapshots_stmt = (
            select(HfRepoSnapshot)
            .where(
                HfRepoSnapshot.repo_id == repo_id,
                HfRepoSnapshot.repo_type == repo_type,
            )
            .order_by(HfRepoSnapshot.created_at.desc())
        )
        snapshots_result = await self._session.execute(snapshots_stmt)
        snapshots = list(snapshots_result.scalars().all())

        return snapshots, total
