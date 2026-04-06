"""Progress tracking schemas."""

from pydantic import BaseModel, ConfigDict, Field

from mgmt_server.api.v1.schemas.base import BaseResponse


class FileProgressItem(BaseModel):
    """单个文件进度项."""

    model_config = ConfigDict(from_attributes=True)

    path: str = Field(..., description="文件路径")
    status: str = Field(..., description="文件状态: pending/downloading/completed/failed")
    downloaded_bytes: int = Field(0, description="已下载字节数")
    total_bytes: int = Field(0, description="总字节数")
    progress_percent: float = Field(0.0, description="下载进度百分比")
    speed_bytes_per_sec: float | None = Field(None, description="下载速度(字节/秒)")
    started_at: str | None = Field(None, description="开始时间(ISO格式)")
    completed_at: str | None = Field(None, description="完成时间(ISO格式)")
    error_message: str | None = Field(None, description="错误信息(如果失败)")


class TaskProgressData(BaseModel):
    """任务整体进度数据."""

    model_config = ConfigDict(from_attributes=True)

    task_id: int = Field(..., description="任务ID")
    status: str = Field(..., description="任务状态: running/completed/failed")
    progress_percent: float = Field(0.0, description="整体进度百分比")
    downloaded_files: int = Field(0, description="已完成文件数")
    total_files: int = Field(0, description="总文件数")
    downloaded_bytes: int = Field(0, description="已下载字节数")
    total_bytes: int = Field(0, description="总字节数")
    current_file: str | None = Field(None, description="当前正在下载的文件")
    speed_bytes_per_sec: float | None = Field(None, description="当前下载速度")
    eta_seconds: int | None = Field(None, description="预计剩余时间(秒)")
    updated_at: str = Field(..., description="最后更新时间(ISO格式)")
    files: list[FileProgressItem] = Field(default_factory=list, description="文件进度列表")


class TaskProgressResponse(BaseResponse[TaskProgressData]):
    """任务进度响应."""

    pass
