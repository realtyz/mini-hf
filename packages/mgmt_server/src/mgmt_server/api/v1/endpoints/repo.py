"""Model management endpoints."""

from typing import Annotated, Literal, cast

from fastapi import APIRouter, HTTPException, Query
from fastapi import status as http_status
from fastapi.responses import RedirectResponse

from database.db_repositories import (
    HfRepoProfileRepository,
    HfRepoSnapshotRepository,
    HfRepoTreeRepository,
)
from database.db_models import RepoStatus
from sqlalchemy import func, select
from database.db_models import HfRepoProfile, HfRepoTreeItem
from mgmt_server.api.deps import CurrentUserToken, DbDep, UserServiceDep
from mgmt_server.api.v1.endpoints.user import AdminUserDep
from storage.client import s3_client
from storage.utils.key_builder import build_blob_key
from mgmt_server.api.v1.schemas.repos import (
    DashboardStats,
    DashboardStatsResponse,
    RepoDetailData,
    RepoDetailResponse,
    RepoListResponse,
    RepoProfileResponse,
    RepoSnapshotResponse,
    RepoTreeItemResponse,
    RepoTreeResponse,
)
from mgmt_server.services.repo_service import RepoService
from services.task import TaskService

router = APIRouter(prefix="/hf_repo", tags=["Repo Management"])


@router.get("/dashboard-stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    db: DbDep,
) -> DashboardStatsResponse:
    """Get dashboard statistics.

    Returns aggregated statistics for the dashboard:
    - total_repos: Total number of HuggingFace repositories (excluding inactive)
    - total_files: Total number of files in S3 bucket
    - storage_capacity: Total storage size in bytes
    - total_downloads: Total download count across all repositories
    """
    repo = HfRepoProfileRepository(db)

    # Get total repos (excluding inactive)
    profiles, total_repos = await repo.list_repos(
        statuses=[RepoStatus.ACTIVE, RepoStatus.UPDATING, RepoStatus.CLEANING],
        limit=1,  # We only need the count
    )

    # Get total downloads (sum of all downloads field)
    downloads_stmt = select(func.sum(HfRepoProfile.downloads))
    result = await db.execute(downloads_stmt)
    total_downloads = result.scalar() or 0

    # Get bucket stats from S3
    bucket_stats = await s3_client.get_bucket_stats()

    return DashboardStatsResponse(
        data=DashboardStats(
            total_repos=total_repos,
            total_files=bucket_stats["total_files"],
            storage_capacity=bucket_stats["total_size"],
            total_downloads=total_downloads,
        )
    )


@router.get("/list", response_model=RepoListResponse)
async def list_repositories(
    db: DbDep,
    repo_type: Annotated[
        str | None,
        Query(description="Filter by repo type: model, dataset, or omit for all"),
    ] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    statuses: Annotated[
        list[str] | None,
        Query(
            description="Filter by status (can specify multiple, e.g. statuses=active&statuses=updating)"
        ),
    ] = None,
    pipeline_tag: Annotated[
        str | None, Query(description="Filter by pipeline tag")
    ] = None,
    search: Annotated[
        str | None, Query(description="Search by repo_id (fuzzy match)")
    ] = None,
    sort_by: Annotated[
        str, Query(description="Sort field: downloads or cache_updated_at")
    ] = "cache_updated_at",
    sort_order: Annotated[str, Query(description="Sort order: asc or desc")] = "desc",
) -> RepoListResponse:
    """List repositories (models and/or datasets) with filtering, search, sorting and pagination.

    Args:
        db: Database session
        repo_type: Filter by repo type (model, dataset), omit for all types
        skip: Number of records to skip (pagination)
        limit: Number of records to return (pagination)
        statuses: Filter by status (can specify multiple: active, inactive, updating, cleaning)
        pipeline_tag: Filter by pipeline tag
        search: Search by repo_id (fuzzy match)
        sort_by: Sort field (downloads or cache_updated_at)
        sort_order: Sort order (asc or desc)

    Returns:
        List of repositories with total count
    """
    repo = HfRepoProfileRepository(db)

    # Convert status strings to enums if provided
    status_enums: list[RepoStatus] | None = None
    if statuses is not None:
        status_enums = []
        for s in statuses:
            try:
                status_enums.append(RepoStatus(s))
            except ValueError:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid status: {s}. Must be one of: active, inactive, updating, cleaning",
                )

    profiles, total = await repo.list_repos(
        repo_type=repo_type,
        skip=skip,
        limit=limit,
        statuses=status_enums,
        pipeline_tag=pipeline_tag,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    return RepoListResponse(
        data=[
            RepoProfileResponse(
                id=p.id,
                repo_id=p.repo_id,
                repo_type=p.repo_type,
                pipeline_tag=p.pipeline_tag,
                cached_commits=p.cached_commits,
                downloads=p.downloads,
                first_cached_at=p.first_cached_at,
                cache_updated_at=p.cache_updated_at,
                last_downloaded_at=p.last_downloaded_at,
                status=p.status.value,
            )
            for p in profiles
        ],
        total=total,
    )


@router.get("/list-public", response_model=RepoListResponse)
async def list_public_repositories(
    db: DbDep,
    repo_type: Annotated[
        str | None,
        Query(description="Filter by repo type: model, dataset, or omit for all"),
    ] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    search: Annotated[
        str | None, Query(description="Search by repo_id (fuzzy match)")
    ] = None,
    sort_by: Annotated[
        str, Query(description="Sort field: downloads or cache_updated_at")
    ] = "cache_updated_at",
    sort_order: Annotated[str, Query(description="Sort order: asc or desc")] = "desc",
) -> RepoListResponse:
    """List publicly visible repositories (active and updating status only).

    No authentication required. Returns repos in active or updating status.
    """
    repo = HfRepoProfileRepository(db)

    profiles, total = await repo.list_repos(
        repo_type=repo_type,
        skip=skip,
        limit=limit,
        statuses=[RepoStatus.ACTIVE, RepoStatus.UPDATING],
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    return RepoListResponse(
        data=[
            RepoProfileResponse(
                id=p.id,
                repo_id=p.repo_id,
                repo_type=p.repo_type,
                pipeline_tag=p.pipeline_tag,
                cached_commits=p.cached_commits,
                downloads=p.downloads,
                first_cached_at=p.first_cached_at,
                cache_updated_at=p.cache_updated_at,
                last_downloaded_at=p.last_downloaded_at,
                status=p.status.value,
            )
            for p in profiles
        ],
        total=total,
    )


@router.get("/model/{repo_id:path}", response_model=RepoDetailResponse)
async def get_model_detail(
    repo_id: str,
    db: DbDep,
) -> RepoDetailResponse:
    """Get model detail with profile and snapshots.

    Args:
        repo_id: Repository ID (e.g., "facebook/bart-large")
        db: Database session

    Returns:
        Model detail with profile and snapshots

    Raises:
        HTTPException: If model not found
    """
    profile_repo = HfRepoProfileRepository(db)
    snapshot_repo = HfRepoSnapshotRepository(db)
    profile, snapshots = await profile_repo.get_profile_with_snapshots(
        repo_id, repo_type="model"
    )

    if profile is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Model '{repo_id}' not found",
        )

    size_stats = await snapshot_repo.get_snapshot_size_stats(
        [s.commit_hash for s in snapshots]
    )

    return RepoDetailResponse(
        data=RepoDetailData(
            profile=RepoProfileResponse(
                id=profile.id,
                repo_id=profile.repo_id,
                repo_type=profile.repo_type,
                pipeline_tag=profile.pipeline_tag,
                cached_commits=profile.cached_commits,
                downloads=profile.downloads,
                first_cached_at=profile.first_cached_at,
                cache_updated_at=profile.cache_updated_at,
                last_downloaded_at=profile.last_downloaded_at,
                status=profile.status.value,
            ),
            snapshots=[
                RepoSnapshotResponse(
                    id=s.id,
                    revision=s.revision,
                    commit_hash=s.commit_hash,
                    committed_at=s.committed_at,
                    created_at=s.created_at,
                    updated_at=s.updated_at,
                    status=s.status.value,
                    total_size=size_stats.get(s.commit_hash, (None, None))[0],
                    cached_size=size_stats.get(s.commit_hash, (None, None))[1],
                )
                for s in snapshots
            ],
        )
    )


@router.get("/dataset/{repo_id:path}", response_model=RepoDetailResponse)
async def get_dataset_detail(
    repo_id: str,
    db: DbDep,
) -> RepoDetailResponse:
    """Get dataset detail with profile and snapshots.

    Args:
        repo_id: Repository ID (e.g., "huggingface/all-the-datasets")
        db: Database session

    Returns:
        Dataset detail with profile and snapshots

    Raises:
        HTTPException: If dataset not found
    """
    profile_repo = HfRepoProfileRepository(db)
    snapshot_repo = HfRepoSnapshotRepository(db)
    profile, snapshots = await profile_repo.get_profile_with_snapshots(
        repo_id, repo_type="dataset"
    )

    if profile is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Dataset '{repo_id}' not found",
        )

    size_stats = await snapshot_repo.get_snapshot_size_stats(
        [s.commit_hash for s in snapshots]
    )

    return RepoDetailResponse(
        data=RepoDetailData(
            profile=RepoProfileResponse(
                id=profile.id,
                repo_id=profile.repo_id,
                repo_type=profile.repo_type,
                pipeline_tag=profile.pipeline_tag,
                cached_commits=profile.cached_commits,
                downloads=profile.downloads,
                first_cached_at=profile.first_cached_at,
                cache_updated_at=profile.cache_updated_at,
                last_downloaded_at=profile.last_downloaded_at,
                status=profile.status.value,
            ),
            snapshots=[
                RepoSnapshotResponse(
                    id=s.id,
                    revision=s.revision,
                    commit_hash=s.commit_hash,
                    committed_at=s.committed_at,
                    created_at=s.created_at,
                    updated_at=s.updated_at,
                    status=s.status.value,
                    total_size=size_stats.get(s.commit_hash, (None, None))[0],
                    cached_size=size_stats.get(s.commit_hash, (None, None))[1],
                )
                for s in snapshots
            ],
        )
    )


@router.delete("/{repo_id:path}")
async def delete_repository(
    repo_id: str,
    admin_user: AdminUserDep,
    current_user: CurrentUserToken,
    user_service: UserServiceDep,
    db: DbDep,
    hard: Annotated[
        bool,
        Query(
            description="Hard delete: remove all database records including profile. Default is soft delete (preserve profile)."
        ),
    ] = False,
) -> dict:
    """Delete an entire cached repository.

    This will delete all snapshots and all blobs from S3.
    By default performs soft delete (preserves profile with CLEANED status).
    Set hard=true to completely remove all database records.

    Args:
        repo_id: Repository ID (e.g., "facebook/bart-large")
        hard: If true, hard delete (remove all records). If false, soft delete (preserve profile).

    Returns:
        Deletion result with details about deleted snapshots and blobs
    """
    # Get real user ID from JWT token
    user = await user_service.get_by_email(current_user.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get repo_type from database
    profile_stmt = select(HfRepoProfile).where(HfRepoProfile.repo_id == repo_id)
    profile_result = await db.execute(profile_stmt)
    profile = profile_result.scalar_one_or_none()

    if profile is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{repo_id}' not found",
        )

    # Check if repository is being updated
    if profile.status == RepoStatus.UPDATING:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail=f"Repository '{repo_id}' is currently being updated. "
            "Please wait for the update to complete before deleting.",
        )

    repo_type = profile.repo_type

    task_service = TaskService()

    # Check if there are active download tasks for this repository
    if await task_service.has_active_download_task(repo_id):
        raise HTTPException(
            status_code=409,
            detail=f"Repository {repo_id} has active download tasks. "
            "Please wait for downloads to complete before deleting.",
        )

    # Execute deletion directly (no Worker involved)
    repo_service = RepoService()
    if hard:
        result = await repo_service.hard_delete_repository(repo_id, repo_type)
    else:
        result = await repo_service.delete_repository(repo_id, repo_type)

    return result


@router.get("/{repo_id:path}/file")
async def get_file_download(
    repo_id: str,
    commit_hash: Annotated[str, Query(description="Commit hash of the snapshot")],
    path: Annotated[str, Query(description="File path within the repository")],
    db: DbDep,
) -> RedirectResponse:
    """Redirect to presigned S3 download URL for a cached file.

    Args:
        repo_id: Repository ID (e.g., "facebook/bart-large")
        commit_hash: Commit hash of the snapshot
        path: File path within the repository

    Returns:
        302 redirect to presigned S3 URL

    Raises:
        HTTPException: If file not found or not cached
    """
    snapshot_repo = HfRepoSnapshotRepository(db)
    # Get snapshot to determine repo_type
    snapshots = await snapshot_repo.get_snapshots_by_commit(repo_id, commit_hash)
    if not snapshots:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Snapshot with commit '{commit_hash}' not found for repository '{repo_id}'",
        )

    repo_type = snapshots[0].repo_type

    # Get tree item by commit_hash and file path
    stmt = select(HfRepoTreeItem).where(
        HfRepoTreeItem.commit_hash == commit_hash,
        HfRepoTreeItem.path == path,
    )
    result = await db.execute(stmt)
    tree_item = result.scalar_one_or_none()

    if tree_item is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"File '{path}' not found in snapshot",
        )

    if not tree_item.is_cached:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"File '{path}' is not cached yet",
        )

    blob_id = tree_item.lfs_oid if tree_item.lfs_oid else tree_item.oid
    if not blob_id:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"File metadata corrupted: '{path}'",
        )

    key = build_blob_key(repo_id, repo_type, blob_id)

    # Extract original filename from path (last part)
    download_filename = path.split("/")[-1]
    presigned_url = await s3_client.create_presigned_url(
        key, download_filename=download_filename
    )

    return RedirectResponse(presigned_url, status_code=302)


@router.get("/{repo_id:path}/tree/{commit_hash}", response_model=RepoTreeResponse)
async def get_repo_tree(
    repo_id: str,
    commit_hash: str,
    db: DbDep,
) -> RepoTreeResponse:
    """Get repository tree (files and directories) for a specific commit.

    Args:
        repo_id: Repository ID (e.g., "facebook/bart-large")
        commit_hash: Commit hash of the snapshot
        db: Database session

    Returns:
        Full list of tree items with cache status
    """
    snapshot_repo = HfRepoSnapshotRepository(db)
    tree_repo = HfRepoTreeRepository(db)

    # Verify snapshot exists
    snapshots = await snapshot_repo.get_snapshots_by_commit(repo_id, commit_hash)
    if not snapshots:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Snapshot with commit '{commit_hash}' not found for repository '{repo_id}'",
        )

    items = await tree_repo.get_file_tree(commit_hash)

    return RepoTreeResponse(
        data=[
            RepoTreeItemResponse(
                path=item.path,
                type=cast(Literal["file", "directory"], item.type),
                size=item.size,
                is_cached=item.is_cached,
            )
            for item in items
        ]
    )
