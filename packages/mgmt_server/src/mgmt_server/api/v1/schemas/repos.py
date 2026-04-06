"""Model-related request/response schemas."""

from datetime import datetime
from typing import Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator

from mgmt_server.api.v1.schemas.base import BaseResponse


class RepoItem(BaseModel):
    """Repository item in download request.

    Represents a file or folder in the repository with its metadata
    and whether it will be downloaded based on the filter rules.
    """

    path: str
    size: int
    type: str  # "file" or "folder"
    required: bool  # Whether this item will be downloaded


class DryRunRequest(BaseModel):
    """Request body for dry-run model download preview."""

    repo_id: str
    repo_type: str
    revision: str | None = None
    access_token: str | None = None
    include_patterns: list[str] | None = None
    exclude_patterns: list[str] | None = None


class CreateTaskFromPreviewRequest(BaseModel):
    """Request body for creating download task from preview data.

    This schema should be populated with fields from TaskPreviewResponse.data.
    """

    # Repository identification
    source: str
    repo_id: str
    repo_type: str
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

    # Complete file tree with required markers
    items: list[RepoItem]

    @field_validator("source")
    @classmethod
    def validate_source(cls, v: str) -> str:
        allowed = {"huggingface", "modelscope"}
        if v not in allowed:
            raise ValueError(f"source must be one of {allowed}")
        return v

    @field_validator("repo_type")
    @classmethod
    def validate_repo_type(cls, v: str) -> str:
        allowed = {"model", "dataset"}
        if v not in allowed:
            raise ValueError(f"repo_type must be one of {allowed}")
        return v


class CreateTaskFromCacheRequest(BaseModel):
    """Request body for creating task from cached preview data.

    Use this when you have a cache_key from the preview endpoint.
    """

    cache_key: str  # The cache key returned by /task/preview


# Union type for create task endpoint - supports both full data and cache key
CreateTaskRequest = Union[CreateTaskFromPreviewRequest, CreateTaskFromCacheRequest]


# Snapshot 信息
class RepoSnapshotResponse(BaseModel):
    """Repository snapshot response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    revision: str
    commit_hash: str
    committed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    status: str  # "active" or "archived"
    total_size: int | None = None
    cached_size: int | None = None


# Profile 信息（列表用）
class RepoProfileResponse(BaseModel):
    """Repository profile response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    repo_id: str
    repo_type: str
    pipeline_tag: str | None
    cached_commits: int
    downloads: int
    first_cached_at: datetime | None
    cache_updated_at: datetime | None
    last_downloaded_at: datetime | None
    status: str


# 详情响应（Profile + Snapshots）
class RepoDetailData(BaseModel):
    """Repository detail data schema."""

    profile: RepoProfileResponse
    snapshots: list[RepoSnapshotResponse]


class RepoListResponse(BaseResponse[list[RepoProfileResponse]]):
    """Repository list response schema."""

    total: int


class RepoDetailResponse(BaseResponse[RepoDetailData]):
    """Repository detail response schema."""

    pass


# ==================== Repo Tree ====================


class PaginatedResponse[T](BaseModel):
    """Paginated response wrapper."""

    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class RepoTreeItemResponse(BaseModel):
    """Repository tree item (file or directory)."""

    path: str = Field(..., description="File/directory path relative to repo root")
    type: Literal["file", "directory"] = Field(..., description="Item type")
    size: int = Field(..., description="Size in bytes (0 for directories)")
    is_cached: bool | None = Field(
        None, description="Cache status: null=directory, false=not cached, true=cached"
    )


class RepoTreeResponse(BaseResponse[list[RepoTreeItemResponse]]):
    """Repository tree response."""

    pass


# ==================== Dashboard Stats ====================


class DashboardStats(BaseModel):
    """Dashboard statistics data."""

    total_repos: int = Field(..., description="Total number of HuggingFace repositories (excluding inactive)")
    total_files: int = Field(..., description="Total number of files in S3 bucket")
    storage_capacity: int = Field(..., description="Total storage capacity in bytes")
    total_downloads: int = Field(..., description="Total download count across all repositories")


class DashboardStatsResponse(BaseResponse[DashboardStats]):
    """Dashboard statistics response."""

    pass
