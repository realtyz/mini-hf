"""Progress tracking schemas."""

from pydantic import BaseModel, ConfigDict, Field

from mgmt_server.api.v1.schemas.base import BaseResponse


class FileProgressItem(BaseModel):
    """Single file progress item."""

    path: str = Field(..., description="File path")
    status: str = Field(
        ..., description="File status: pending/downloading/completed/failed"
    )
    downloaded_bytes: int = Field(0, description="Downloaded bytes")
    total_bytes: int = Field(0, description="Total bytes")
    progress_percent: float = Field(0.0, description="Download progress percentage")
    speed_bytes_per_sec: float | None = Field(
        None, description="Download speed (bytes/sec)"
    )
    started_at: str | None = Field(None, description="Start time (ISO format)")
    completed_at: str | None = Field(None, description="Completion time (ISO format)")
    error_message: str | None = Field(None, description="Error message (if failed)")


class TaskProgressData(BaseModel):
    """Task overall progress data."""

    model_config = ConfigDict(from_attributes=True)

    task_id: int = Field(..., description="Task ID")
    status: str = Field(..., description="Task status: running/completed/failed")
    progress_percent: float = Field(0.0, description="Overall progress percentage")
    downloaded_files: int = Field(0, description="Completed file count")
    total_files: int = Field(0, description="Total file count")
    downloaded_bytes: int = Field(0, description="Downloaded bytes")
    total_bytes: int = Field(0, description="Total bytes")
    current_file: str | None = Field(None, description="Current downloading file")
    speed_bytes_per_sec: float | None = Field(
        None, description="Current download speed"
    )
    eta_seconds: int | None = Field(
        None, description="Estimated remaining time (seconds)"
    )
    updated_at: str = Field(..., description="Last update time (ISO format)")
    files: list[FileProgressItem] = Field(
        default_factory=list, description="File progress list"
    )


class TaskProgressResponse(BaseResponse[TaskProgressData]):
    """Task progress response."""
