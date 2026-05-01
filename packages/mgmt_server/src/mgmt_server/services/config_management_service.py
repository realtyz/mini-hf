"""Config management service — orchestration layer for system configuration."""

from __future__ import annotations

import asyncio
from typing import Literal

from loguru import logger
from database.db_models.system_config import SystemConfig
from services import EmailClient, SMTPConfig
from services.config import (
    AnnouncementConfig,
    ConfigService,
    ConfigUpdateItem,
    HFEndpointConfig,
    NotificationConfig,
)

from mgmt_server.core.constants import SMTP_TEST_TIMEOUT
from mgmt_server.core.exceptions import ValidationError


class ConfigManagementService:
    """Orchestrates config operations with business rules.

    Wraps the core ConfigService and adds:
    - SMTP connection testing with timeout
    - HF endpoint validation
    - Test-before-save workflows
    """

    def __init__(self, config_service: ConfigService):
        self._config = config_service

    # ------------------------------------------------------------------
    # Generic config CRUD
    # ------------------------------------------------------------------

    async def list_configs(self, category: str | None = None) -> list[SystemConfig]:
        return await self._config.get_all_models(category=category)

    async def get_config(self, key: str) -> SystemConfig | None:
        return await self._config.get_model(key)

    async def create_config(
        self,
        *,
        key: str,
        value: str,
        category: str,
        description: str | None,
        is_sensitive: bool,
    ) -> SystemConfig:
        return await self._config.create(
            key=key,
            value=value,
            category=category,
            description=description,
            is_sensitive=is_sensitive,
        )

    async def update_config(
        self, *, key: str, value: str, description: str | None
    ) -> SystemConfig | None:
        return await self._config.set_partial(
            key=key, value=value, description=description
        )

    async def delete_config(self, key: str) -> bool:
        return await self._config.delete(key)

    async def batch_update(self, items: list[ConfigUpdateItem]) -> None:
        await self._config.batch_update(items)

    async def initialize_defaults(self) -> None:
        await self._config.initialize_defaults()

    # ------------------------------------------------------------------
    # SMTP
    # ------------------------------------------------------------------

    async def test_smtp(self, smtp_config: SMTPConfig) -> tuple[bool, str]:
        """Test SMTP connection with timeout."""
        client = EmailClient(smtp_config)
        try:
            success, message = await asyncio.wait_for(
                client.test_connection(),
                timeout=SMTP_TEST_TIMEOUT,
            )
        except asyncio.TimeoutError:
            success = False
            message = (
                f"SMTP connection timed out after {int(SMTP_TEST_TIMEOUT)} seconds"
            )
        except ConnectionError as e:
            success = False
            message = f"SMTP connection test failed: {e}"
        return success, message

    async def get_smtp_config(self) -> SMTPConfig:
        return await self._config.get_smtp_config()

    async def save_smtp_config(
        self,
        *,
        smtp_config: SMTPConfig,
        test_before_save: bool = False,
        admin_email: str | None = None,
    ) -> SMTPConfig:
        """Save SMTP config with optional test-before-save."""
        if test_before_save:
            success, message = await self.test_smtp(smtp_config)
            if not success:
                if admin_email:
                    logger.warning(
                        "SMTP save rejected for admin {} - connection test failed: {}",
                        admin_email,
                        message,
                    )
                raise ValidationError(f"SMTP connection test failed: {message}")

        result = await self._config.save_smtp_config(
            host=smtp_config.host,
            port=smtp_config.port,
            username=smtp_config.username,
            password=smtp_config.password,
            use_tls=smtp_config.use_tls,
            from_email=smtp_config.from_email,
        )
        if admin_email:
            logger.info("SMTP configuration saved by admin {}", admin_email)
        return result

    # ------------------------------------------------------------------
    # HuggingFace
    # ------------------------------------------------------------------

    async def get_hf_config(self) -> HFEndpointConfig:
        return await self._config.get_hf_config()

    async def save_hf_config(
        self,
        *,
        endpoints: list[str],
        default_endpoint: str,
        admin_email: str | None = None,
    ) -> HFEndpointConfig:
        """Save HF endpoint config with validation."""
        cleaned = [e.strip() for e in endpoints if e.strip()]
        cleaned_default = default_endpoint.strip()
        if cleaned_default not in cleaned:
            raise ValidationError("Default endpoint must be in the endpoints list")

        result = await self._config.save_hf_endpoint_config(
            endpoints=cleaned,
            default_endpoint=cleaned_default,
        )
        if admin_email:
            logger.info("HF endpoint configuration saved by admin {}", admin_email)
        return result

    # ------------------------------------------------------------------
    # Notification
    # ------------------------------------------------------------------

    async def get_notification_config(self) -> NotificationConfig:
        return await self._config.get_notification_config()

    async def save_notification_config(
        self,
        *,
        email: str,
        task_approval_push: bool,
        auto_approve_enabled: bool,
        auto_approve_threshold_gb: int,
        admin_email: str | None = None,
    ) -> NotificationConfig:
        result = await self._config.save_notification_config(
            email=email,
            task_approval_push=task_approval_push,
            auto_approve_enabled=auto_approve_enabled,
            auto_approve_threshold_gb=auto_approve_threshold_gb,
        )
        if admin_email:
            logger.info("Notification configuration saved by admin {}", admin_email)
        return result

    # ------------------------------------------------------------------
    # Announcement
    # ------------------------------------------------------------------

    async def get_announcement_config(self) -> AnnouncementConfig:
        return await self._config.get_announcement_config()

    async def save_announcement_config(
        self,
        *,
        content: str,
        announcement_type: Literal["info", "warning", "urgent"],
        is_active: bool,
    ) -> AnnouncementConfig:
        return await self._config.save_announcement_config(
            content=content,
            announcement_type=announcement_type,
            is_active=is_active,
        )
