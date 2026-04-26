"""Task-related request/response schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from database.db_models.task import TaskStatus
from mgmt_server.api.v1.schemas.base import BaseResponse, PaginationQueryParams, RepoId
from mgmt_server.api.v1.schemas.repos import RepoFileItem


class TaskListQueryParams(PaginationQueryParams):
    """Query parameters for authenticated task list endpoint."""

    status: TaskStatus | None = None


class PublicTaskListQueryParams(PaginationQueryParams):
    """Query parameters for public task list endpoint (adds hours filter)."""

    hours: int = Field(24, ge=1, le=168)
    status: TaskStatus | None = None


class TaskCreatorUser(BaseModel):
    """Creator user info embedded in task response."""

    id: int
    name: str
    email: str


class TaskResponse(BaseModel):
    """Task response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    source: str
    repo_id: RepoId
    repo_type: str
    revision: str
    hf_endpoint: str | None = None
    status: TaskStatus
    error_message: str | None
    created_at: datetime
    reviewed_at: datetime | None
    updated_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    pinned_at: datetime | None = None
    required_storage: int
    creator_user_id: int
    creator_user: TaskCreatorUser | None = None

    # Repository statistics
    total_storage: int
    required_file_count: int
    total_file_count: int
    repo_items: list[RepoFileItem] | None = None
    commit_hash: str | None

    # Download statistics (populated after completion/failure)
    downloaded_file_count: int | None = None
    downloaded_bytes: int | None = None


class TaskListResponse(BaseResponse[list[TaskResponse]]):
    """Task list response schema."""

    total: int


class ActiveTaskListResponse(BaseResponse[list[TaskResponse]]):
    """Active task list response schema — no pagination, no total."""


class TaskDetailResponse(BaseResponse[TaskResponse]):
    """Task detail response schema."""


class TaskReviewRequest(BaseModel):
    """Task review request schema."""

    approved: bool
    notes: str | None = None


class TaskPreviewRequest(BaseModel):
    """Task preview request schema.

    Used to preview repository information before creating a download task.
    """

    source: Literal["huggingface", "modelscope"] = "huggingface"
    repo_type: Literal["model", "dataset"] = "model"
    repo_id: RepoId
    revision: str = "main"
    hf_endpoint: str | None = None
    access_token: str | None = Field(None, max_length=128)
    full_download: bool = True
    allow_patterns: list[str] | None = None
    ignore_patterns: list[str] | None = None


class TaskPreviewData(BaseModel):
    """Task preview response data schema."""

    repo_id: str
    repo_type: str
    revision: str
    commit_hash: str | None
    hf_endpoint: str | None = None

    # Repository statistics
    total_storage: int
    total_file_count: int

    # Required download statistics (after filtering)
    required_storage: int
    required_file_count: int

    items: list[RepoFileItem]
    cache_key: str

    # Update check results
    cached_commit_hash: str | None = None

    all_required_cached: bool = False


class TaskPreviewResponse(BaseResponse[TaskPreviewData]):
    """Task preview response schema."""


class AsyncPreviewTaskData(BaseModel):
    """Async preview task creation response data."""

    task_id: str
    status: str = Field(
        ..., description="pending, fetching, processing, completed, failed"
    )
    message: str


class AsyncPreviewTaskResponse(BaseResponse[AsyncPreviewTaskData]):
    """Async preview task creation response.

    Returned immediately when starting a background preview task.
    Use the task_id to poll for completion via GET /task/preview/{task_id}.
    """


class AsyncPreviewTaskStatusData(BaseModel):
    """Async preview task status and result data."""

    task_id: str
    status: str
    repo_id: str
    repo_type: str
    revision: str
    progress_message: str
    progress_percent: float
    error_message: str | None = None
    # Result is only present when status is "completed"
    result: TaskPreviewData | None = None


class AsyncPreviewTaskStatusResponse(BaseResponse[AsyncPreviewTaskStatusData]):
    """Async preview task status response."""
