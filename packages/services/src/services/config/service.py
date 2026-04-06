"""Public configuration service layer.

This module provides the public API for accessing configuration values.
External code should use `ConfigService` from this module rather than
accessing the internal provider directly.

Features:
- Business-specific configuration helpers (SMTP, HuggingFace, notifications)
- Typed configuration objects (SMTPConfig, etc.)
- Default configuration initialization
- High-level abstractions built on top of the internal ConfigProvider

Example:
    async def send_email(db: AsyncSession):
        config_service = ConfigService(db)
        email_client = await config_service.get_email_client()
        if email_client:
            await email_client.send_email(...)
"""

import json

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from services.config._provider import ConfigProvider
from services import SMTPConfig, EmailClient


class ConfigService:
    """Public configuration service for external use.

    This is the primary interface for accessing configuration values.
    All external code should use this class rather than the internal
    ConfigProvider.

    Features:
    - Business-oriented configuration methods
    - Typed configuration objects (SMTPConfig, etc.)
    - Combines multiple config values into cohesive business objects
    - Default configuration initialization for first-time setup

    Example:
        async def send_email(db: AsyncSession):
            config_service = ConfigService(db)
            email_client = await config_service.get_email_client()
            if email_client:
                await email_client.send_email(...)
    """

    # Default configurations for initialization
    DEFAULT_CONFIGS = [
        {
            "key": "smtp_host",
            "value": "",
            "category": "email",
            "description": "SMTP server hostname",
        },
        {
            "key": "smtp_port",
            "value": "587",
            "category": "email",
            "description": "SMTP server port",
        },
        {
            "key": "smtp_username",
            "value": "",
            "category": "email",
            "description": "SMTP authentication username",
        },
        {
            "key": "smtp_password",
            "value": "",
            "category": "email",
            "description": "SMTP authentication password",
            "is_sensitive": True,
        },
        {
            "key": "smtp_use_tls",
            "value": "true",
            "category": "email",
            "description": "Use TLS encryption for SMTP",
        },
        {
            "key": "smtp_from_email",
            "value": "",
            "category": "email",
            "description": "Default sender email address",
        },
        {
            "key": "hf_endpoints",
            "value": '["https://huggingface.co", "https://hf-mirror.com"]',
            "category": "huggingface",
            "description": "可用的 HuggingFace endpoint 列表（JSON 数组）",
        },
        {
            "key": "hf_default_endpoint",
            "value": "https://huggingface.co",
            "category": "huggingface",
            "description": "默认使用的 HuggingFace endpoint",
        },
        {
            "key": "notification_email",
            "value": "",
            "category": "notification",
            "description": "通知接收邮箱，多个用逗号分隔",
        },
        {
            "key": "notification_task_approval",
            "value": "true",
            "category": "notification",
            "description": "是否推送任务审批通知",
        },
        {
            "key": "auto_approve_enabled",
            "value": "false",
            "category": "notification",
            "description": "是否开启自动审批",
        },
        {
            "key": "auto_approve_threshold_gb",
            "value": "100",
            "category": "notification",
            "description": "自动审批阈值（GB）",
        },
        {
            "key": "system_announcement",
            "value": "",
            "category": "announcement",
            "description": "系统公告内容",
        },
        {
            "key": "system_announcement_type",
            "value": "info",
            "category": "announcement",
            "description": "公告类型: info/warning/urgent",
        },
        {
            "key": "system_announcement_active",
            "value": "true",
            "category": "announcement",
            "description": "是否启用公告",
        },
    ]

    def __init__(self, session: AsyncSession):
        """Initialize ConfigService.

        Args:
            session: SQLAlchemy async session
        """
        self._provider = ConfigProvider(session)
        self._logger = logger

    @property
    def manager(self) -> ConfigProvider:
        """Get the underlying ConfigManager for direct access."""
        return self._provider

    async def get_smtp_config(self) -> SMTPConfig:
        """Get SMTP configuration as a data class.

        Returns:
            SMTPConfig instance with values from database
        """
        return SMTPConfig(
            host=await self._provider.get("smtp_host"),
            port=await self._provider.get_int("smtp_port", 587),
            username=await self._provider.get("smtp_username"),
            password=await self._provider.get("smtp_password"),
            use_tls=await self._provider.get_bool("smtp_use_tls", True),
            from_email=await self._provider.get("smtp_from_email"),
        )

    async def get_hf_endpoints(self) -> list[str]:
        """Get list of configured HF endpoints."""
        raw = await self._provider.get("hf_endpoints", "[]")
        try:
            endpoints = json.loads(raw)
            if isinstance(endpoints, list):
                return [str(e).strip() for e in endpoints if str(e).strip()]
        except (json.JSONDecodeError, TypeError):
            pass
        return ["https://huggingface.co"]

    async def get_hf_default_endpoint(self) -> str:
        """Get default HF endpoint."""
        endpoints = await self.get_hf_endpoints()
        default = await self._provider.get(
            "hf_default_endpoint", "https://huggingface.co"
        )
        default = str(default).strip()
        if default in endpoints:
            return default
        return endpoints[0] if endpoints else "https://huggingface.co"

    async def get_email_client(
        self, template_dir: str | None = None
    ) -> EmailClient | None:
        """Get configured email client.

        Args:
            template_dir: Optional directory containing Jinja2 templates

        Returns:
            EmailClient instance if SMTP is configured, None otherwise
        """
        config = await self.get_smtp_config()
        if not config.is_configured:
            logger.debug("SMTP not configured, email client unavailable")
            return None
        return EmailClient(config, template_dir=template_dir)

    async def initialize_defaults(self) -> int:
        """Initialize default configurations if they don't exist.

        This is useful for first-time setup.

        Returns:
            Number of configs created
        """
        return await self._provider.initialize_defaults(
            defaults=self.DEFAULT_CONFIGS,
        )

    @classmethod
    def invalidate(cls, key: str | None = None) -> None:
        """Invalidate cache for a key or all keys."""
        ConfigProvider.invalidate(key)

    async def get_notification_config(self) -> dict:
        """Get notification configuration.

        Returns:
            Dict with notification settings
        """
        return {
            "email": await self._provider.get("notification_email", ""),
            "task_approval_push": await self._provider.get_bool(
                "notification_task_approval", True
            ),
            "auto_approve_enabled": await self._provider.get_bool(
                "auto_approve_enabled", False
            ),
            "auto_approve_threshold_gb": await self._provider.get_int(
                "auto_approve_threshold_gb", 100
            ),
        }

    async def get_announcement_config(self) -> dict:
        """Get announcement configuration.

        Returns:
            Dict with announcement content, type and active status
        """
        return {
            "content": await self._provider.get("system_announcement", ""),
            "announcement_type": await self._provider.get(
                "system_announcement_type", "info"
            ),
            "is_active": await self._provider.get_bool(
                "system_announcement_active", True
            ),
        }
