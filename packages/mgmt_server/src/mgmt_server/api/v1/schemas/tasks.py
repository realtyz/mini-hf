"""Task-related request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from mgmt_server.api.v1.schemas.base import BaseResponse


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
    repo_id: str
    repo_type: str
    revision: str
    hf_endpoint: str | None = None
    status: str
    error_message: str | None
    created_at: datetime
    reviewed_at: datetime | None
    updated_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    pinned_at: datetime | None = None  # 置顶时间，用于优先级排序
    required_storage: int
    creator_user_id: int
    creator_user: TaskCreatorUser | None = None

    # 仓库统计信息
    total_storage: int
    required_file_count: int
    total_file_count: int
    repo_items: list
    commit_hash: str | None

    # 实际下载统计（任务完成或失败后填充）
    downloaded_file_count: int | None = None
    downloaded_bytes: int | None = None


class TaskListResponse(BaseResponse[list[TaskResponse]]):
    """Task list response schema."""

    total: int


class TaskDetailResponse(BaseResponse[TaskResponse]):
    """Task detail response schema."""

    pass


class TaskReviewRequest(BaseModel):
    """Task review request schema."""

    approved: bool
    notes: str | None = None


class TaskPreviewRequest(BaseModel):
    """Task preview request schema.

    Used to preview repository information before creating a download task.
    """

    source: str = "huggingface"
    repo_type: str = "model"
    repo_id: str
    revision: str = "main"
    hf_endpoint: str | None = None
    access_token: str | None = None
    full_download: bool = True
    allow_patterns: list[str] | None = None
    ignore_patterns: list[str] | None = None


class PreviewItem(BaseModel):
    """Repository item in preview response.

    Represents a file or folder in the repository with its metadata
    and whether it will be downloaded based on the filter rules.
    """

    path: str
    size: int
    type: str  # "file" or "folder"
    required: bool  # Whether this item will be downloaded


class TaskPreviewData(BaseModel):
    """Task preview response data schema."""

    repo_id: str
    repo_type: str
    revision: str
    commit_hash: str | None
    hf_endpoint: str | None = None

    # Repository statistics
    total_storage: int  # Total size in bytes
    total_file_count: int  # Total number of files

    # Required download statistics
    required_storage: int  # Size to download in bytes
    required_file_count: int  # Number of files to download

    # Complete file tree with required markers
    items: list[PreviewItem]

    # Cache key for creating task without resending data
    cache_key: str  # Use this key to create task from cached preview data

    # Update check results
    cached_commit_hash: str | None = None  # The commit hash of the currently cached version (if any)

    # Cache status for required files
    all_required_cached: bool = False  # Whether all requested files are already cached


class TaskPreviewResponse(BaseResponse[TaskPreviewData]):
    """Task preview response schema."""

    pass


# Async Preview Task Schemas


class AsyncPreviewTaskData(BaseModel):
    """Async preview task creation response data."""

    task_id: str
    status: str  # pending, fetching, processing, completed, failed
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

    pass
