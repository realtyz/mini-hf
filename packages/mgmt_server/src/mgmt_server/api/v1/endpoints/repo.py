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
from mgmt_server.api.deps import CurrentUserToken, DbDep, RepoServiceDep, UserServiceDep
from mgmt_server.api.v1.endpoints.user import AdminUserDep
from mgmt_server.api.v1.schemas.repos import (
    RepoDetailData,
    RepoDetailResponse,
    RepoListResponse,
    RepoProfileResponse,
    RepoSnapshotResponse,
    RepoTreeItemResponse,
    RepoTreeResponse,
)

router = APIRouter(prefix="/hf_repo", tags=["Repo Management"])


def _map_repo_status(statuses: list[str] | None) -> list[RepoStatus] | None:
    """Convert status strings to RepoStatus enums, raising on invalid values."""
    if statuses is None:
        return None
    status_enums: list[RepoStatus] = []
    for s in statuses:
        try:
            status_enums.append(RepoStatus(s))
        except ValueError:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {s}. Must be one of: active, inactive, updating, cleaning",
            )
    return status_enums


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
    """List repositories with filtering, search, sorting and pagination."""
    repo = HfRepoProfileRepository(db)
    status_enums = _map_repo_status(statuses)

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
        data=[RepoProfileResponse.from_model(p) for p in profiles],
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
    """List publicly visible repositories (active and updating status only)."""
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
        data=[RepoProfileResponse.from_model(p) for p in profiles],
        total=total,
    )


async def _get_repo_detail(
    repo_id: str,
    repo_type: str,
    db: DbDep,
) -> RepoDetailResponse:
    """Shared logic for model/dataset detail."""
    profile_repo = HfRepoProfileRepository(db)
    snapshot_repo = HfRepoSnapshotRepository(db)

    profile, snapshots = await profile_repo.get_profile_with_snapshots(
        repo_id, repo_type=repo_type
    )

    if profile is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"{repo_type.capitalize()} '{repo_id}' not found",
        )

    size_stats = await snapshot_repo.get_snapshot_size_stats(
        [s.commit_hash for s in snapshots]
    )

    return RepoDetailResponse(
        data=RepoDetailData(
            profile=RepoProfileResponse.from_model(profile),
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


@router.get("/model/{repo_id:path}", response_model=RepoDetailResponse)
async def get_model_detail(
    repo_id: str,
    db: DbDep,
) -> RepoDetailResponse:
    """Get model detail with profile and snapshots."""
    return await _get_repo_detail(repo_id, repo_type="model", db=db)


@router.get("/dataset/{repo_id:path}", response_model=RepoDetailResponse)
async def get_dataset_detail(
    repo_id: str,
    db: DbDep,
) -> RepoDetailResponse:
    """Get dataset detail with profile and snapshots."""
    return await _get_repo_detail(repo_id, repo_type="dataset", db=db)


@router.delete("/{repo_id:path}")
async def delete_repository(
    repo_id: str,
    admin_user: AdminUserDep,
    current_user: CurrentUserToken,
    user_service: UserServiceDep,
    repo_service: RepoServiceDep,
    hard: Annotated[
        bool,
        Query(
            description="Hard delete: remove all database records including profile. Default is soft delete (preserve profile)."
        ),
    ] = False,
) -> dict:
    """Delete an entire cached repository."""
    user = await user_service.get_by_email(current_user.email)
    if not user:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    return await repo_service.delete_repo(repo_id, hard=hard)


@router.get("/{repo_id:path}/file")
async def get_file_download(
    repo_id: str,
    commit_hash: Annotated[str, Query(description="Commit hash of the snapshot")],
    path: Annotated[str, Query(description="File path within the repository")],
    repo_service: RepoServiceDep,
) -> RedirectResponse:
    """Redirect to presigned S3 download URL for a cached file."""
    presigned_url = await repo_service.get_file_download_url(
        repo_id, commit_hash, path
    )
    return RedirectResponse(presigned_url, status_code=302)


@router.get("/{repo_id:path}/tree/{commit_hash}", response_model=RepoTreeResponse)
async def get_repo_tree(
    repo_id: str,
    commit_hash: str,
    db: DbDep,
) -> RepoTreeResponse:
    """Get repository tree (files and directories) for a specific commit."""
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
