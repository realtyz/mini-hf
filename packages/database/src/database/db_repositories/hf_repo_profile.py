"""Repository for HuggingFace repository profile operations."""

from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database.db_models import HfRepoProfile, HfRepoSnapshot, RepoStatus, SnapshotStatus


class HfRepoProfileRepository:
    """Repository for HfRepoProfile entity operations.

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
    ) -> HfRepoProfile:
        """Get existing profile or create new one.

        Args:
            repo_id: Repository ID
            repo_type: Repository type (model/dataset)
            initial_status: Initial status for new profile (default: UPDATING)

        Returns:
            Existing or newly created profile
        """
        stmt = select(HfRepoProfile).where(
            HfRepoProfile.repo_id == repo_id,
            HfRepoProfile.repo_type == repo_type,
        )
        result = await self._session.execute(stmt)
        profile = result.scalar_one_or_none()

        if profile is None:
            profile = HfRepoProfile(
                repo_id=repo_id,
                repo_type=repo_type,
                status=initial_status if initial_status else RepoStatus.UPDATING,
            )
            self._session.add(profile)
            await self._session.commit()

        return profile

    async def get_profile(
        self,
        repo_id: str,
        repo_type: str,
    ) -> HfRepoProfile | None:
        """Get profile by repo_id and repo_type.

        Args:
            repo_id: Repository ID
            repo_type: Repository type (model/dataset)

        Returns:
            Profile or None if not found
        """
        stmt = select(HfRepoProfile).where(
            HfRepoProfile.repo_id == repo_id,
            HfRepoProfile.repo_type == repo_type,
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
            count_stmt = (
                select(func.count())
                .select_from(
                    select(HfRepoSnapshot).where(
                        HfRepoSnapshot.repo_id == repo_id,
                        HfRepoSnapshot.repo_type == repo_type,
                        HfRepoSnapshot.status == SnapshotStatus.ACTIVE,
                    ).subquery()
                )
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

        await self._session.commit()

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
        await self._session.commit()
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
        stmt = select(HfRepoProfile).where(
            HfRepoProfile.repo_id == repo_id,
            HfRepoProfile.repo_type == repo_type,
        )
        result = await self._session.execute(stmt)
        profile = result.scalar_one_or_none()

        if profile is None:
            return False

        profile.status = status
        await self._session.commit()
        return True

    async def soft_delete_profile(
        self,
        repo_id: str,
        repo_type: str,
    ) -> bool:
        """Soft delete repository profile: set CLEANED status, clear cached_commits.

        Preserves downloads, first_cached_at, cache_updated_at for historical tracking.

        Args:
            repo_id: Repository ID
            repo_type: Repository type (model/dataset)

        Returns:
            True if profile was found and updated, False otherwise
        """
        stmt = (
            update(HfRepoProfile)
            .where(
                HfRepoProfile.repo_id == repo_id,
                HfRepoProfile.repo_type == repo_type,
            )
            .values(
                status=RepoStatus.CLEANED,
                cached_commits=0,
                # downloads, first_cached_at, cache_updated_at are preserved
            )
        )
        result = await self._session.execute(stmt)
        await self._session.commit()
        return result.rowcount > 0  # type: ignore[attr-defined]

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
        stmt = select(HfRepoProfile).where(
            HfRepoProfile.repo_id == repo_id,
            HfRepoProfile.repo_type == repo_type,
        )
        result = await self._session.execute(stmt)
        profile = result.scalar_one_or_none()

        if profile is None:
            return False

        await self._session.delete(profile)
        await self._session.commit()
        return True

    async def get_profile_with_snapshots(
        self,
        repo_id: str,
        repo_type: str,
    ) -> tuple[HfRepoProfile | None, list[HfRepoSnapshot]]:
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
            select(HfRepoSnapshot)
            .where(
                HfRepoSnapshot.repo_id == repo_id,
                HfRepoSnapshot.repo_type == repo_type,
            )
            .order_by(HfRepoSnapshot.created_at.desc())
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
    ) -> tuple[list[HfRepoProfile], int]:
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
            base_stmt = select(HfRepoProfile).where(
                HfRepoProfile.repo_type == repo_type
            )
        else:
            base_stmt = select(HfRepoProfile)

        # Apply filters
        if statuses is not None:
            base_stmt = base_stmt.where(HfRepoProfile.status.in_(statuses))
        elif status is not None:
            base_stmt = base_stmt.where(HfRepoProfile.status == status)
        if pipeline_tag is not None:
            base_stmt = base_stmt.where(HfRepoProfile.pipeline_tag == pipeline_tag)
        if search is not None:
            base_stmt = base_stmt.where(HfRepoProfile.repo_id.ilike(f"%{search}%"))

        # Get total count
        count_stmt = select(func.count()).select_from(base_stmt.subquery())
        total_result = await self._session.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply sorting
        sort_column = getattr(HfRepoProfile, sort_by, HfRepoProfile.cache_updated_at)
        if sort_order.lower() == "desc":
            base_stmt = base_stmt.order_by(sort_column.desc())
        else:
            base_stmt = base_stmt.order_by(sort_column.asc())

        # Apply pagination
        base_stmt = base_stmt.offset(skip).limit(limit)

        result = await self._session.execute(base_stmt)
        profiles = list(result.scalars().all())

        return profiles, total
