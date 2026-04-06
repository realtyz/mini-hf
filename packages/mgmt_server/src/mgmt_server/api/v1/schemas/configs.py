"""System configuration schemas."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

from mgmt_server.api.v1.schemas.base import BaseResponse


class ConfigItem(BaseModel):
    """Configuration item schema."""

    model_config = ConfigDict(from_attributes=True)

    key: str = Field(..., description="Configuration key")
    value: str = Field(..., description="Configuration value")
    category: str = Field(..., description="Configuration category")
    description: str | None = Field(None, description="Configuration description")
    is_sensitive: bool = Field(False, description="Whether the value is sensitive")
    updated_at: datetime = Field(..., description="Last update time")


class ConfigCreateRequest(BaseModel):
    """Configuration create request schema."""

    key: str = Field(..., min_length=1, max_length=255, description="Configuration key")
    value: str = Field(..., description="Configuration value")
    category: str = Field(default="general", max_length=50, description="Configuration category")
    description: str | None = Field(None, description="Configuration description")
    is_sensitive: bool = Field(default=False, description="Whether the value is sensitive")


class ConfigUpdateRequest(BaseModel):
    """Configuration update request schema."""

    value: str = Field(..., description="New configuration value")
    description: str | None = Field(None, description="New description")


class ConfigBatchUpdateItem(BaseModel):
    """Single item for batch configuration update."""

    key: str = Field(..., description="Configuration key")
    value: str = Field(..., description="New configuration value")
    category: str | None = Field(default=None, description="Configuration category (for new configs)")
    description: str | None = Field(default=None, description="Configuration description (for new configs)")
    is_sensitive: bool = Field(default=False, description="Whether the value is sensitive (for new configs)")


class ConfigBatchUpdateRequest(BaseModel):
    """Batch configuration update request schema."""

    configs: list[ConfigBatchUpdateItem] = Field(
        ..., min_length=1, description="List of configurations to update"
    )


class ConfigListResponse(BaseResponse[list[ConfigItem]]):
    """Configuration list response schema."""

    total: int = Field(0, description="Total number of configurations")


class ConfigDetailResponse(BaseResponse[ConfigItem]):
    """Configuration detail response schema."""


class ConfigCreateResponse(BaseResponse[ConfigItem]):
    """Configuration create response schema."""


class ConfigUpdateResponse(BaseResponse[ConfigItem]):
    """Configuration update response schema."""


class ConfigDeleteResponse(BaseResponse[None]):
    """Configuration delete response schema."""

    message: str = "Configuration deleted successfully"


class SMTPConfigResponse(BaseModel):
    """SMTP configuration response schema."""

    host: str = Field(..., description="SMTP server hostname")
    port: int = Field(..., description="SMTP server port")
    username: str = Field(..., description="SMTP authentication username")
    use_tls: bool = Field(..., description="Whether to use TLS encryption")
    from_email: str = Field(..., description="Default sender email address")
    is_configured: bool = Field(
        ..., description="Whether SMTP is fully configured"
    )


class SMTPConfigResponseWrapper(BaseResponse[SMTPConfigResponse]):
    """SMTP configuration wrapped in base response."""


class SMTPTestRequest(BaseModel):
    """SMTP connection test request schema."""

    host: str = Field(..., description="SMTP server hostname")
    port: int = Field(default=587, description="SMTP server port")
    username: str = Field(..., description="SMTP authentication username")
    password: str = Field(..., description="SMTP authentication password")
    use_tls: bool = Field(default=True, description="Whether to use TLS encryption")
    from_email: str | None = Field(default=None, description="Sender email address (optional for test)")


class SMTPSaveRequest(BaseModel):
    """SMTP configuration save request schema."""

    host: str = Field(..., description="SMTP server hostname")
    port: int = Field(default=587, description="SMTP server port")
    username: str = Field(..., description="SMTP authentication username")
    password: str = Field(..., description="SMTP authentication password")
    use_tls: bool = Field(default=True, description="Whether to use TLS encryption")
    from_email: str = Field(..., description="Default sender email address")
    test_before_save: bool = Field(
        default=True, description="Test SMTP connection before saving"
    )


class SMTPTestResponse(BaseResponse[bool]):
    """SMTP connection test response schema."""

    data: bool = Field(default=False, description="Test success status")
    test_message: str = Field(..., description="Test result message")


class HFEndpointConfigResponse(BaseModel):
    """HF endpoint configuration response schema."""

    endpoints: list[str] = Field(..., description="List of available HF endpoints")
    default_endpoint: str = Field(..., description="Default HF endpoint to use")


class HFEndpointConfigResponseWrapper(BaseResponse[HFEndpointConfigResponse]):
    """HF endpoint configuration wrapped in base response."""


class HFEndpointSaveRequest(BaseModel):
    """HF endpoint configuration save request schema."""

    endpoints: list[str] = Field(
        ..., min_length=1, description="List of available HF endpoints"
    )
    default_endpoint: str = Field(..., description="Default endpoint, must be in endpoints")


class NotificationConfigResponse(BaseModel):
    """Notification configuration response schema."""

    email: str = Field(..., description="通知接收邮箱")
    task_approval_push: bool = Field(..., description="任务审批推送开关")
    auto_approve_enabled: bool = Field(..., description="自动审批开关")
    auto_approve_threshold_gb: int = Field(..., description="自动审批阈值（GB）")


class NotificationConfigResponseWrapper(BaseResponse[NotificationConfigResponse]):
    """Notification configuration wrapped in base response."""


class NotificationSaveRequest(BaseModel):
    """Notification configuration save request schema."""

    email: str = Field(default="", description="通知接收邮箱，多个用逗号分隔")
    task_approval_push: bool = Field(default=True, description="是否推送任务审批通知")
    auto_approve_enabled: bool = Field(default=False, description="是否开启自动审批")
    auto_approve_threshold_gb: int = Field(default=100, description="自动审批阈值（GB）")


class AnnouncementType(str):
    """Announcement type enum."""

    INFO = "info"
    WARNING = "warning"
    URGENT = "urgent"


class AnnouncementConfigResponse(BaseModel):
    """Announcement configuration response schema."""

    content: str = Field(..., description="系统公告内容")
    announcement_type: str = Field(default="info", description="公告类型: info/warning/urgent")
    is_active: bool = Field(default=True, description="是否启用公告")


class AnnouncementConfigResponseWrapper(BaseResponse[AnnouncementConfigResponse]):
    """Announcement configuration wrapped in base response."""


class AnnouncementSaveRequest(BaseModel):
    """Announcement configuration save request schema."""

    content: str = Field(default="", description="系统公告内容")
    announcement_type: str = Field(default="info", description="公告类型: info/warning/urgent")
    is_active: bool = Field(default=True, description="是否启用公告")
