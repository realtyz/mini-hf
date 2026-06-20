"""Model management endpoints."""

from typing import Annotated, Protocol

from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse

from database.db_models import HfRepoProfile, HfRepoSnapshot, RepoStatus
from database.db_repositories.hf_repo_snapshot import SizeStats
from mgmt_server.api.deps import AdminUserDep, CacheScanServiceDep, RepoServiceDep
from mgmt_server.api.v1.schemas.base import RepoId
from mgmt_server.core.exceptions import NotFoundError, ValidationError
from mgmt_server.api.v1.schemas.repos import (
    DeleteRepoResponse,
    RepoDetailData,
    RepoDetailResponse,
    RepoListQueryParams,
    RepoListResponse,
    RepoProfileResponse,
    RepoSnapshotResponse,
    RepoTreeItemResponse,
    RepoTreeResponse,
)

router = APIRouter()


def _validate_file_path(path: str) -> str:
    """Validate file path to prevent path traversal attacks.

    Checks for:
    - Path traversal sequences (..)
    - Absolute paths (starting with /)
    - Windows-style absolute paths (starting with C:, etc.)

    Returns normalized path without leading slashes.
    """
    # Block path traversal
    if ".." in path:
        raise ValidationError("Invalid path: '..' sequence not allowed")

    # Block absolute paths
    if path.startswith("/"):
        raise ValidationError("Invalid path: absolute paths not allowed")

    # Block Windows absolute paths (C:, D:, etc.)
    if len(path) >= 2 and path[1] == ":":
        raise ValidationError("Invalid path: absolute paths not allowed")

    # Normalize and return
    normalized = path.replace("\\", "/")
    return normalized


class _RepoDetailProvider(Protocol):
    """Protocol for repo detail operations used by endpoint helpers."""

    async def get_repo_detail(
        self,
        repo_id: str,
        repo_type: str,
    ) -> tuple[HfRepoProfile | None, list[HfRepoSnapshot], dict[str, SizeStats]]: ...


def _map_repo_status(statuses: list[str] | None) -> list[RepoStatus] | None:
    """Convert status strings to RepoStatus enums, raising on invalid values."""
    if statuses is None:
        return None
    status_enums: list[RepoStatus] = []
    for s in statuses:
        try:
            status_enums.append(RepoStatus(s))
        except ValueError:
            raise ValidationError(
                f"Invalid status: {s}. Must be one of: {', '.join(e.value for e in RepoStatus)}"
            )
    return status_enums


@router.get("/list", response_model=RepoListResponse)
async def list_repositories(
    repo_service: RepoServiceDep,
    params: Annotated[RepoListQueryParams, Depends()],
    statuses: Annotated[
        list[str] | None,
        Query(
            description="Filter by status (can specify multiple, e.g. statuses=active&statuses=updating)"
        ),
    ] = None,
    pipeline_tag: Annotated[
        str | None, Query(description="Filter by pipeline tag")
    ] = None,
) -> RepoListResponse:
    """List repositories with filtering, search, sorting and pagination."""
    status_enums = _map_repo_status(statuses)

    profiles, total = await repo_service.list_repos(
        repo_type=params.repo_type,
        skip=params.skip,
        limit=params.limit,
        statuses=status_enums,
        pipeline_tag=pipeline_tag,
        search=params.search,
        sort_by=params.sort_by,
        sort_order=params.sort_order,
    )

    return RepoListResponse(
        data=[RepoProfileResponse.from_model(p) for p in profiles],
        total=total,
    )


@router.get("/list-public", response_model=RepoListResponse)
async def list_public_repositories(
    repo_service: RepoServiceDep,
    params: Annotated[RepoListQueryParams, Depends()],
    statuses: Annotated[
        list[str] | None,
        Query(
            description="Filter by status (can specify multiple, e.g. statuses=active&statuses=updating)"
        ),
    ] = None,
) -> RepoListResponse:
    """List publicly visible repositories (default: active and updating only)."""
    status_enums = _map_repo_status(statuses) if statuses else [RepoStatus.ACTIVE, RepoStatus.UPDATING]

    profiles, total = await repo_service.list_repos(
        repo_type=params.repo_type,
        skip=params.skip,
        limit=params.limit,
        statuses=status_enums,
        search=params.search,
        sort_by=params.sort_by,
        sort_order=params.sort_order,
    )

    return RepoListResponse(
        data=[RepoProfileResponse.from_model(p) for p in profiles],
        total=total,
    )


async def _get_repo_detail(
    repo_id: str,
    repo_type: str,
    repo_service: _RepoDetailProvider,
) -> RepoDetailResponse:
    """Shared logic for model/dataset detail."""
    profile, snapshots, size_stats = await repo_service.get_repo_detail(
        repo_id, repo_type=repo_type
    )

    if profile is None:
        raise NotFoundError(f"{repo_type.capitalize()} '{repo_id}' not found")

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
                    status=s.status,
                    total_size=size_stats[s.commit_hash].total_size
                    if s.commit_hash in size_stats
                    else None,
                    cached_size=size_stats[s.commit_hash].cached_size
                    if s.commit_hash in size_stats
                    else None,
                )
                for s in snapshots
            ],
        )
    )


@router.get("/model/{repo_id:path}", response_model=RepoDetailResponse)
async def get_model_detail(
    repo_id: RepoId,
    repo_service: RepoServiceDep,
) -> RepoDetailResponse:
    """Get model detail with profile and snapshots."""
    return await _get_repo_detail(repo_id, repo_type="model", repo_service=repo_service)


@router.get("/dataset/{repo_id:path}", response_model=RepoDetailResponse)
async def get_dataset_detail(
    repo_id: RepoId,
    repo_service: RepoServiceDep,
) -> RepoDetailResponse:
    """Get dataset detail with profile and snapshots."""
    return await _get_repo_detail(
        repo_id, repo_type="dataset", repo_service=repo_service
    )


@router.delete("/{repo_id:path}", response_model=DeleteRepoResponse)
async def delete_repository(
    repo_id: RepoId,
    admin_user: AdminUserDep,
    repo_service: RepoServiceDep,
    cache_scan_service: CacheScanServiceDep,
    repo_type: str | None = Query(
        None, pattern="^(model|dataset)$",
        description="Required for untracked repos (S3 data without DB profile)",
    ),
) -> DeleteRepoResponse:
    """Delete an entire cached repository and all associated records.

    For untracked repositories (S3 data without a DB profile), pass
    *repo_type* to enable direct S3 cleanup.
    """
    result = await repo_service.delete_repo(repo_id, repo_type=repo_type)
    await cache_scan_service.remove_repos_from_cached_result({repo_id})
    return DeleteRepoResponse(data=result)


@router.get("/{repo_id:path}/file")
async def get_file_download(
    repo_id: RepoId,
    commit_hash: Annotated[str, Query(description="Commit hash of the snapshot")],
    path: Annotated[str, Query(description="File path within the repository")],
    repo_service: RepoServiceDep,
) -> RedirectResponse:
    """Redirect to presigned S3 download URL for a cached file.

    Public endpoint (no auth required): compatible with HF Hub download flow.
    """
    path = _validate_file_path(path)
    presigned_url = await repo_service.get_file_download_url(repo_id, commit_hash, path)
    return RedirectResponse(presigned_url, status_code=302)


@router.get("/{repo_id:path}/tree/{commit_hash}", response_model=RepoTreeResponse)
async def get_repo_tree(
    repo_id: RepoId,
    commit_hash: str,
    repo_service: RepoServiceDep,
) -> RepoTreeResponse:
    """Get repository tree (files and directories) for a specific commit."""
    items = await repo_service.get_repo_tree(repo_id, commit_hash)

    return RepoTreeResponse(
        data=[
            RepoTreeItemResponse(
                path=item.path,
                type=item.type,
                size=item.size,
                is_cached=item.is_cached,
            )
            for item in items
        ]
    )
