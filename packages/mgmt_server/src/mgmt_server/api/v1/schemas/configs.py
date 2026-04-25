"""System configuration schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

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

    @classmethod
    def from_model(cls, config) -> "ConfigItem":
        """Create ConfigItem from a SystemConfig database model."""
        return cls(
            key=config.key,
            value="" if config.is_sensitive else config.value,
            category=config.category,
            description=config.description,
            is_sensitive=config.is_sensitive,
            updated_at=config.updated_at,
        )


class ConfigCreateRequest(BaseModel):
    """Configuration create request schema."""

    key: str = Field(..., min_length=1, max_length=255, description="Configuration key")
    value: str = Field(..., description="Configuration value")
    category: str = Field(
        default="general", max_length=50, description="Configuration category"
    )
    description: str | None = Field(None, description="Configuration description")
    is_sensitive: bool = Field(
        default=False, description="Whether the value is sensitive"
    )


class ConfigUpdateRequest(BaseModel):
    """Configuration update request schema."""

    value: str = Field(..., description="New configuration value")
    description: str | None = Field(None, description="New description")


class ConfigBatchUpdateItem(BaseModel):
    """Single item for batch configuration update."""

    key: str = Field(..., description="Configuration key")
    value: str = Field(..., description="New configuration value")
    category: str | None = Field(
        default=None, description="Configuration category (for new configs)"
    )
    description: str | None = Field(
        default=None, description="Configuration description (for new configs)"
    )
    is_sensitive: bool = Field(
        default=False, description="Whether the value is sensitive (for new configs)"
    )


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


class SMTPConfigResponse(BaseModel):
    """SMTP configuration response schema."""

    host: str = Field(..., description="SMTP server hostname")
    port: int = Field(..., description="SMTP server port")
    username: str = Field(..., description="SMTP authentication username")
    use_tls: bool = Field(..., description="Whether to use TLS encryption")
    from_email: str = Field(..., description="Default sender email address")
    is_configured: bool = Field(..., description="Whether SMTP is fully configured")

    @classmethod
    def from_model(cls, config) -> SMTPConfigResponse:
        """Create from SMTPConfig dataclass (password excluded)."""
        return cls(
            host=config.host,
            port=config.port,
            username=config.username,
            use_tls=config.use_tls,
            from_email=config.from_email,
            is_configured=config.is_configured,
        )


class SMTPTestRequest(BaseModel):
    """SMTP connection test request schema."""

    host: str = Field(..., description="SMTP server hostname")
    port: int = Field(default=587, description="SMTP server port")
    username: str = Field(..., description="SMTP authentication username")
    password: str = Field(..., description="SMTP authentication password")
    use_tls: bool = Field(default=True, description="Whether to use TLS encryption")
    from_email: str | None = Field(
        default=None, description="Sender email address (optional for test)"
    )


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

    @classmethod
    def from_model(cls, config) -> HFEndpointConfigResponse:
        """Create from HFEndpointConfig dataclass."""
        return cls(
            endpoints=config.endpoints,
            default_endpoint=config.default_endpoint,
        )


class HFEndpointSaveRequest(BaseModel):
    """HF endpoint configuration save request schema."""

    endpoints: list[str] = Field(
        ..., min_length=1, description="List of available HF endpoints"
    )
    default_endpoint: str = Field(
        ..., description="Default endpoint, must be in endpoints"
    )


class NotificationConfigResponse(BaseModel):
    """Notification configuration response schema."""

    email: str = Field(..., description="Notification recipient emails")
    task_approval_push: bool = Field(
        ..., description="Task approval push notification switch"
    )
    auto_approve_enabled: bool = Field(..., description="Auto-approval switch")
    auto_approve_threshold_gb: int = Field(
        ..., description="Auto-approval threshold (GB)"
    )

    @classmethod
    def from_model(cls, config) -> NotificationConfigResponse:
        """Create from NotificationConfig dataclass."""
        return cls(
            email=config.email,
            task_approval_push=config.task_approval_push,
            auto_approve_enabled=config.auto_approve_enabled,
            auto_approve_threshold_gb=config.auto_approve_threshold_gb,
        )


class NotificationSaveRequest(BaseModel):
    """Notification configuration save request schema."""

    email: str = Field(
        default="", description="Notification recipient emails, comma-separated"
    )
    task_approval_push: bool = Field(
        default=True, description="Push task approval notifications"
    )
    auto_approve_enabled: bool = Field(
        default=False, description="Enable auto-approval"
    )
    auto_approve_threshold_gb: int = Field(
        default=100, description="Auto-approval threshold (GB)"
    )


class AnnouncementConfigResponse(BaseModel):
    """Announcement configuration response schema."""

    content: str = Field(..., description="System announcement content")
    announcement_type: Literal["info", "warning", "urgent"] = Field(
        default="info", description="Announcement type"
    )
    is_active: bool = Field(
        default=True, description="Whether the announcement is active"
    )

    @classmethod
    def from_model(cls, config) -> AnnouncementConfigResponse:
        """Create from AnnouncementConfig dataclass."""
        return cls(
            content=config.content,
            announcement_type=config.announcement_type,
            is_active=config.is_active,
        )


class AnnouncementSaveRequest(BaseModel):
    """Announcement configuration save request schema."""

    content: str = Field(default="", description="System announcement content")
    announcement_type: Literal["info", "warning", "urgent"] = Field(
        default="info", description="Announcement type"
    )
    is_active: bool = Field(
        default=True, description="Whether the announcement is active"
    )
