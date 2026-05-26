"""Config management service — orchestration layer for system configuration."""

from __future__ import annotations

import asyncio

from loguru import logger
from services import EmailClient, SMTPConfig
from services.config import (
    ConfigService,
    HFEndpointConfig,
)
from services.config.schema_builder import ConfigSchemaBuilder

from mgmt_server.api.v1.schemas.configs import ConfigSchemaData
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

        result = await self._config.save_smtp_config(smtp_config)
        if admin_email:
            logger.info("SMTP configuration saved by admin {}", admin_email)
        return result

    # ------------------------------------------------------------------
    # HuggingFace
    # ------------------------------------------------------------------

    async def save_hf_config(
        self,
        *,
        endpoints: list[str],
        default_endpoint: str,
        admin_email: str | None = None,
    ) -> HFEndpointConfig:
        """Save HF endpoint config with validation."""
        result = await self._config.save_hf_endpoint_config(
            HFEndpointConfig(endpoints=endpoints, default_endpoint=default_endpoint)
        )
        if admin_email:
            logger.info("HF endpoint configuration saved by admin {}", admin_email)
        return result

    # ------------------------------------------------------------------
    # Schema
    # ------------------------------------------------------------------

    async def get_schema(self) -> ConfigSchemaData:
        builder = ConfigSchemaBuilder(self._config._provider)
        return await builder.build()
