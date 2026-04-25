"""Model-related request/response schemas."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from database.db_models.enums import RepoStatus, SnapshotStatus, TreeItemType
from mgmt_server.api.v1.schemas.base import BaseResponse, PaginationQueryParams, RepoId


class RepoListQueryParams(PaginationQueryParams):
    """Query parameters for repository list endpoints."""

    repo_type: str | None = None
    sort_by: Literal["downloads", "cache_updated_at"] = "cache_updated_at"
    sort_order: Literal["asc", "desc"] = "desc"


class RepoFileItem(BaseModel):
    """Repository item (file or folder) with download filter status."""

    path: str
    size: int
    type: Literal["file", "folder"]
    required: bool


# Backward-compatible alias
RepoItem = RepoFileItem


class CreateTaskFromPreviewRequest(BaseModel):
    """Request body for creating download task from preview data.

    This schema should be populated with fields from TaskPreviewResponse.data.
    """

    # Repository identification
    source: Literal["huggingface", "modelscope"]
    repo_id: RepoId
    repo_type: Literal["model", "dataset"]
    revision: str
    commit_hash: str | None = None
    hf_endpoint: str | None = None
    access_token: str | None = None

    # Repository statistics
    total_storage: int
    total_file_count: int

    # Required download statistics (after filtering)
    required_storage: int
    required_file_count: int

    items: list[RepoItem]


class CreateTaskFromCacheRequest(BaseModel):
    """Request body for creating task from cached preview data.

    Use this when you have a cache_key from the preview endpoint.
    """

    cache_key: str


class RepoSnapshotResponse(BaseModel):
    """Repository snapshot response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    revision: str
    commit_hash: str
    committed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    status: SnapshotStatus
    total_size: int | None = None
    cached_size: int | None = None


class RepoProfileResponse(BaseModel):
    """Repository profile response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    repo_id: RepoId
    repo_type: str
    pipeline_tag: str | None
    cached_commits: int
    downloads: int
    first_cached_at: datetime | None
    cache_updated_at: datetime | None
    last_downloaded_at: datetime | None
    status: RepoStatus

    @classmethod
    def from_model(cls, profile: Any) -> "RepoProfileResponse":
        """Create response from ORM model."""
        return cls(
            id=profile.id,
            repo_id=profile.repo_id,
            repo_type=profile.repo_type,
            pipeline_tag=profile.pipeline_tag,
            cached_commits=profile.cached_commits,
            downloads=profile.downloads,
            first_cached_at=profile.first_cached_at,
            cache_updated_at=profile.cache_updated_at,
            last_downloaded_at=profile.last_downloaded_at,
            status=profile.status,
        )


class RepoDetailData(BaseModel):
    """Repository detail data schema."""

    profile: RepoProfileResponse
    snapshots: list[RepoSnapshotResponse]


class RepoListResponse(BaseResponse[list[RepoProfileResponse]]):
    """Repository list response schema."""

    total: int


class RepoDetailResponse(BaseResponse[RepoDetailData]):
    """Repository detail response schema."""


class RepoTreeItemResponse(BaseModel):
    """Repository tree item (file or directory)."""

    path: str = Field(..., description="File/directory path relative to repo root")
    type: TreeItemType = Field(..., description="Item type")
    size: int = Field(..., description="Size in bytes (0 for directories)")
    is_cached: bool | None = Field(
        None, description="Cache status: null=directory, false=not cached, true=cached"
    )


class RepoTreeResponse(BaseResponse[list[RepoTreeItemResponse]]):
    """Repository tree response."""


class DashboardStats(BaseModel):
    """Dashboard statistics data."""

    total_repos: int = Field(
        ..., description="Total number of HuggingFace repositories (excluding inactive)"
    )
    total_files: int = Field(..., description="Total number of files in S3 bucket")
    storage_capacity: int = Field(..., description="Total storage capacity in bytes")
    total_downloads: int = Field(
        ..., description="Total download count across all repositories"
    )


class DashboardStatsResponse(BaseResponse[DashboardStats]):
    """Dashboard statistics response."""


class DeleteRepoResult(BaseModel):
    """Result of repository deletion operation."""

    deleted: bool
    repo_id: RepoId
    snapshots_deleted: int = 0
    tree_items_deleted: int = 0
    blobs_deleted: int = 0
    blobs_failed: int = 0
    profile_deleted: bool = False
    message: str = ""


class DeleteRepoResponse(BaseResponse[DeleteRepoResult]):
    """Repository deletion response wrapped in BaseResponse."""
