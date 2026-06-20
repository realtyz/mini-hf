"""Repair service — manual status modification for profiles and snapshots.

Provides admin-only operations to fix stuck or inconsistent metadata states.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.db_models import HfRepoSnapshot
from database.db_models.enums import RepoStatus, SnapshotStatus
from database.db_repositories.hf_repo_profile import HfRepoProfileRepository
from database.db_repositories.hf_repo_snapshot import HfRepoSnapshotRepository
from mgmt_server.core.exceptions import NotFoundError


@dataclass
class RepairResult:
    """Result of a repair operation."""

    repo_id: str | None = None
    repo_type: str | None = None
    snapshot_id: int | None = None
    revision: str | None = None
    commit_hash: str | None = None
    previous_status: str = ""
    new_status: str = ""
    auto_archived_snapshot_id: int | None = None


class RepairService:
    """Service for admin repair operations on profile and snapshot status."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._profile_repo = HfRepoProfileRepository(session)
        self._snapshot_repo = HfRepoSnapshotRepository(session)

    # ------------------------------------------------------------------
    # Profile status
    # ------------------------------------------------------------------

    async def set_profile_status(
        self,
        repo_id: str,
        repo_type: str,
        new_status: RepoStatus,
    ) -> RepairResult:
        """Change a profile's RepoStatus.

        Args:
            repo_id: Repository ID (namespace/repo-name)
            repo_type: Repository type (model/dataset)
            new_status: Target status

        Returns:
            RepairResult with before/after status

        Raises:
            NotFoundError: If profile does not exist
        """
        profile = await self._profile_repo.get_profile(repo_id, repo_type)
        if profile is None:
            raise NotFoundError(
                f"Profile not found: {repo_type}/{repo_id}"
            )

        previous_status = profile.status.value

        await self._profile_repo.set_profile_status(repo_id, repo_type, new_status)

        return RepairResult(
            repo_id=repo_id,
            repo_type=repo_type,
            previous_status=previous_status,
            new_status=new_status.value,
        )

    # ------------------------------------------------------------------
    # Snapshot status
    # ------------------------------------------------------------------

    async def set_snapshot_status(
        self,
        snapshot_id: int,
        new_status: SnapshotStatus,
    ) -> RepairResult:
        """Change a snapshot's SnapshotStatus.

        When promoting a snapshot to ACTIVE, any existing ACTIVE snapshot for
        the same (repo_id, repo_type, revision) is automatically archived to
        maintain the "one active per revision" invariant.

        Args:
            snapshot_id: Primary key of the snapshot
            new_status: Target status

        Returns:
            RepairResult with before/after status and optional auto-archive info

        Raises:
            NotFoundError: If snapshot does not exist
        """
        stmt = select(HfRepoSnapshot).where(HfRepoSnapshot.id == snapshot_id)
        result = await self._session.execute(stmt)
        snapshot = result.scalar_one_or_none()

        if snapshot is None:
            raise NotFoundError(f"Snapshot not found: id={snapshot_id}")

        previous_status = snapshot.status.value
        auto_archived_id: int | None = None

        if (
            new_status == SnapshotStatus.ACTIVE
            and previous_status != SnapshotStatus.ACTIVE.value
        ):
            # Auto-archive any existing ACTIVE snapshot for the same revision
            archived = await self._snapshot_repo.archive_snapshot(
                repo_id=snapshot.repo_id,
                repo_type=snapshot.repo_type,
                revision=snapshot.revision,
            )
            if archived is not None:
                auto_archived_id = archived.id

        snapshot.status = new_status
        await self._session.flush()

        return RepairResult(
            snapshot_id=snapshot.id,
            repo_id=snapshot.repo_id,
            revision=snapshot.revision,
            commit_hash=snapshot.commit_hash,
            previous_status=previous_status,
            new_status=new_status.value,
            auto_archived_snapshot_id=auto_archived_id,
        )
