"""Repository for ModelScope repository profile operations."""

from datetime import datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database.db_models import MsRepoProfile, MsRepoSnapshot, RepoStatus, SnapshotStatus


class MsRepoProfileRepository:
    """Repository for MsRepoProfile entity operations.

    This repository handles all database operations related to repository profiles,
    including creation, updates, listing, and status management.
    """

    def __init__(self, session: AsyncSession):
        self._session = session

    async def get_or_create_profile(
        self,
        repo_id: str,
        repo_type: str,
        initial_status: RepoStatus | None = None,
    ) -> MsRepoProfile:
        """Get existing profile or create new one.

        Args:
            repo_id: Repository ID
            repo_type: Repository type (model/dataset)
            initial_status: Initial status for new profile (default: UPDATING)

        Returns:
            Existing or newly created profile
        """
        stmt = select(MsRepoProfile).where(
            MsRepoProfile.repo_id == repo_id,
            MsRepoProfile.repo_type == repo_type,
        )
        result = await self._session.execute(stmt)
        profile = result.scalar_one_or_none()

        if profile is None:
            profile = MsRepoProfile(
                repo_id=repo_id,
                repo_type=repo_type,
                status=initial_status if initial_status else RepoStatus.UPDATING,
            )
            self._session.add(profile)
            await self._session.flush()

        return profile

    async def get_profile(
        self,
        repo_id: str,
        repo_type: str,
    ) -> MsRepoProfile | None:
        """Get profile by repo_id and repo_type.

        Args:
            repo_id: Repository ID
            repo_type: Repository type (model/dataset)

        Returns:
            Profile or None if not found
        """
        stmt = select(MsRepoProfile).where(
            MsRepoProfile.repo_id == repo_id,
            MsRepoProfile.repo_type == repo_type,
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def update_profile_on_cache(
        self,
        repo_id: str,
        repo_type: str,
        is_new_commit: bool,
        pipeline_tag: str | None = None,
        new_status: RepoStatus | None = None,
    ) -> None:
        """Update profile when cache is completed.

        Args:
            repo_id: Repository ID
            repo_type: Repository type (model/dataset)
            is_new_commit: Whether this is a new commit being cached
            pipeline_tag: Optional pipeline tag to set if not already set
            new_status: Optional new status to set for the profile
        """
        profile = await self.get_or_create_profile(repo_id, repo_type)

        if is_new_commit:
            # Query actual active snapshot count instead of incrementing
            count_stmt = select(func.count()).select_from(
                select(MsRepoSnapshot)
                .where(
                    MsRepoSnapshot.repo_id == repo_id,
                    MsRepoSnapshot.repo_type == repo_type,
                    MsRepoSnapshot.status == SnapshotStatus.ACTIVE,
                )
                .subquery()
            )
            count_result = await self._session.execute(count_stmt)
            profile.cached_commits = count_result.scalar() or 0

        # 首次缓存时设置 first_cached_at
        if profile.first_cached_at is None:
            profile.first_cached_at = datetime.now()

        profile.cache_updated_at = datetime.now()

        if pipeline_tag and not profile.pipeline_tag:
            profile.pipeline_tag = pipeline_tag

        if new_status:
            profile.status = new_status

        await self._session.flush()

    async def increment_downloads(
        self,
        repo_id: str,
        repo_type: str,
    ) -> bool:
        """Increment downloads counter for a repository.

        Args:
            repo_id: Repository ID
            repo_type: Repository type (model/dataset)

        Returns:
            True if profile was found and updated, False otherwise
        """
        profile = await self.get_profile(repo_id, repo_type)
        if profile is None:
            return False
        profile.downloads += 1
        profile.last_downloaded_at = datetime.now()
        await self._session.flush()
        return True

    async def set_profile_status(
        self,
        repo_id: str,
        repo_type: str,
        status: RepoStatus,
    ) -> bool:
        """Set profile status.

        Args:
            repo_id: Repository ID
            repo_type: Repository type (model/dataset)
            status: New status to set

        Returns:
            True if profile was found and updated, False otherwise
        """
        stmt = select(MsRepoProfile).where(
            MsRepoProfile.repo_id == repo_id,
            MsRepoProfile.repo_type == repo_type,
        )
        result = await self._session.execute(stmt)
        profile = result.scalar_one_or_none()

        if profile is None:
            return False

        profile.status = status
        profile.cache_updated_at = datetime.now()
        await self._session.flush()
        return True

    async def delete_profile(
        self,
        repo_id: str,
        repo_type: str,
    ) -> bool:
        """Delete repository profile.

        Args:
            repo_id: Repository ID
            repo_type: Repository type (model/dataset)

        Returns:
            True if profile was found and deleted, False otherwise
        """
        stmt = select(MsRepoProfile).where(
            MsRepoProfile.repo_id == repo_id,
            MsRepoProfile.repo_type == repo_type,
        )
        result = await self._session.execute(stmt)
        profile = result.scalar_one_or_none()

        if profile is None:
            return False

        await self._session.delete(profile)
        await self._session.flush()
        return True

    async def get_profile_by_repo_id(
        self,
        repo_id: str,
    ) -> MsRepoProfile | None:
        """Get profile by repo_id only (without repo_type filter).

        Args:
            repo_id: Repository ID

        Returns:
            Profile or None if not found
        """
        stmt = select(MsRepoProfile).where(
            MsRepoProfile.repo_id == repo_id,
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_profile_with_snapshots(
        self,
        repo_id: str,
        repo_type: str,
    ) -> tuple[MsRepoProfile | None, list[MsRepoSnapshot]]:
        """Get profile with all snapshots for a repository.

        Args:
            repo_id: Repository ID
            repo_type: Repository type (model/dataset)

        Returns:
            Tuple of (profile, list of snapshots)
        """
        # Get profile
        profile = await self.get_profile(repo_id, repo_type)

        # Get all snapshots for this repo
        stmt = (
            select(MsRepoSnapshot)
            .where(
                MsRepoSnapshot.repo_id == repo_id,
                MsRepoSnapshot.repo_type == repo_type,
            )
            .order_by(MsRepoSnapshot.created_at.desc())
        )
        result = await self._session.execute(stmt)
        snapshots = list(result.scalars().all())

        return profile, snapshots

    async def list_repos(
        self,
        repo_type: str | None = None,
        skip: int = 0,
        limit: int = 20,
        status: RepoStatus | None = None,
        statuses: list[RepoStatus] | None = None,
        pipeline_tag: str | None = None,
        search: str | None = None,
        sort_by: str = "cache_updated_at",
        sort_order: str = "desc",
    ) -> tuple[list[MsRepoProfile], int]:
        """List repositories with filtering, search, sorting and pagination.

        Args:
            repo_type: Repository type (model/dataset), None for all types
            skip: Number of records to skip (pagination)
            limit: Number of records to return (pagination)
            status: Filter by status
            statuses: Filter by multiple statuses
            pipeline_tag: Filter by pipeline tag
            search: Search by repo_id (fuzzy match)
            sort_by: Sort field (downloads or cache_updated_at)
            sort_order: Sort order (asc or desc)

        Returns:
            Tuple of (list of profiles, total count)
        """
        # Build base query
        if repo_type is not None:
            base_stmt = select(MsRepoProfile).where(
                MsRepoProfile.repo_type == repo_type
            )
        else:
            base_stmt = select(MsRepoProfile)

        # Apply filters
        if statuses is not None:
            base_stmt = base_stmt.where(MsRepoProfile.status.in_(statuses))
        elif status is not None:
            base_stmt = base_stmt.where(MsRepoProfile.status == status)
        if pipeline_tag is not None:
            base_stmt = base_stmt.where(MsRepoProfile.pipeline_tag == pipeline_tag)
        if search is not None:
            base_stmt = base_stmt.where(MsRepoProfile.repo_id.ilike(f"%{search}%"))

        # Get total count
        count_stmt = select(func.count()).select_from(base_stmt.subquery())
        total_result = await self._session.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply sorting
        sort_column = getattr(MsRepoProfile, sort_by, MsRepoProfile.cache_updated_at)
        if sort_order.lower() == "desc":
            base_stmt = base_stmt.order_by(sort_column.desc())
        else:
            base_stmt = base_stmt.order_by(sort_column.asc())

        # Apply pagination
        base_stmt = base_stmt.offset(skip).limit(limit)

        result = await self._session.execute(base_stmt)
        profiles = list(result.scalars().all())

        return profiles, total

    async def get_updating_profiles(self) -> list[MsRepoProfile]:
        """Get all profiles stuck in UPDATING status.

        Used at worker startup to recover profiles left in UPDATING by a
        crashed worker process.
        """
        stmt = select(MsRepoProfile).where(MsRepoProfile.status == RepoStatus.UPDATING)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_profiles_by_pairs(
        self,
        pairs: list[tuple[str, str]],
    ) -> dict[tuple[str, str], MsRepoProfile]:
        """Batch-fetch profiles by (repo_id, repo_type) pairs.

        Args:
            pairs: List of (repo_id, repo_type) tuples to look up.

        Returns:
            Dict mapping (repo_id, repo_type) -> MsRepoProfile.
            Pairs that don't match any profile are simply absent from the dict.
        """
        if not pairs:
            return {}

        conditions = [
            and_(
                MsRepoProfile.repo_id == repo_id,
                MsRepoProfile.repo_type == repo_type,
            )
            for repo_id, repo_type in pairs
        ]
        stmt = select(MsRepoProfile).where(or_(*conditions))
        result = await self._session.execute(stmt)
        return {(p.repo_id, p.repo_type): p for p in result.scalars().all()}

    async def count_repos(
        self,
        statuses: list[RepoStatus] | None = None,
    ) -> int:
        """Count repositories matching the given statuses."""
        stmt = select(func.count()).select_from(MsRepoProfile)
        if statuses is not None:
            stmt = stmt.where(MsRepoProfile.status.in_(statuses))
        result = await self._session.execute(stmt)
        return result.scalar() or 0
