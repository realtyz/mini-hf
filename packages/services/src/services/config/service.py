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
    config_service = ConfigService(session)
    smtp_config = await config_service.get_smtp_config()
    if smtp_config.is_configured:
        client = EmailClient(smtp_config)
        await client.send_email(...)
"""

import json
from dataclasses import dataclass
from typing import Literal

from loguru import logger
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from database.db_models.system_config import SystemConfig
from services.config._provider import ConfigProvider
from services.config.registry import ConfigKey, ConfigRegistry


@dataclass
class ConfigUpdateItem:
    """Typed configuration update item for batch operations."""

    key: str
    value: str
    category: str = "general"
    description: str | None = None
    is_sensitive: bool = False


@dataclass
class SMTPConfig:
    """SMTP configuration for email client."""

    host: str = ""
    port: int = 587
    username: str = ""
    password: str = ""
    use_tls: bool = True
    from_email: str = ""

    @property
    def is_configured(self) -> bool:
        """Check if SMTP is properly configured."""
        return bool(self.host and self.username and self.password)


@dataclass
class NotificationConfig:
    """Typed notification configuration."""

    email: str
    task_approval_push: bool
    auto_approve_enabled: bool
    auto_approve_threshold_gb: int


@dataclass
class HFEndpointConfig:
    """Typed HuggingFace endpoint configuration."""

    endpoints: list[str]
    default_endpoint: str


@dataclass
class AnnouncementConfig:
    """Typed announcement configuration."""

    content: str
    announcement_type: Literal["info", "warning", "urgent"]
    is_active: bool


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
        config_service = ConfigService(session)
        smtp_config = await config_service.get_smtp_config()
        if smtp_config.is_configured:
            client = EmailClient(smtp_config)
            await client.send_email(...)
    """

    # Default configurations for initialization — derived from the registry
    DEFAULT_CONFIGS = ConfigRegistry.defaults_dict()

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

    @property
    def config_manager(self) -> ConfigProvider:
        """Get the underlying ConfigManager for direct access (alias for manager)."""
        return self._provider

    async def get(self, key: str, default: str = "") -> str:
        """Get a configuration value with caching.

        Args:
            key: Configuration key
            default: Default value if not found

        Returns:
            Configuration value or default
        """
        return await self._provider.get(key, default)

    async def get_int(self, key: str, default: int = 0) -> int:
        """Get a configuration value as integer.

        Args:
            key: Configuration key
            default: Default value if not found or invalid

        Returns:
            Configuration value as integer
        """
        return await self._provider.get_int(key, default)

    async def get_bool(self, key: str, default: bool = False) -> bool:
        """Get a configuration value as boolean.

        Args:
            key: Configuration key
            default: Default value if not found

        Returns:
            Configuration value as boolean
        """
        return await self._provider.get_bool(key, default)

    async def get_float(self, key: str, default: float = 0.0) -> float:
        """Get a configuration value as float.

        Args:
            key: Configuration key
            default: Default value if not found or invalid

        Returns:
            Configuration value as float
        """
        return await self._provider.get_float(key, default)

    async def get_by_prefix(self, prefix: str) -> dict[str, str]:
        """Get all configuration values with a given key prefix.

        Args:
            prefix: Key prefix to filter by

        Returns:
            Dictionary of key-value pairs (with prefix stripped)
        """
        return await self._provider.get_by_prefix(prefix)

    async def get_model(self, key: str) -> SystemConfig | None:
        """Get a configuration model object by key.

        Args:
            key: Configuration key

        Returns:
            SystemConfig model or None if not found
        """
        return await self._provider._repo.get(key)

    async def get_all_models(self, category: str | None = None) -> list[SystemConfig]:
        """Get all configuration model objects, optionally filtered by category.

        Args:
            category: Optional category filter

        Returns:
            List of SystemConfig models
        """
        if category:
            return [
                c
                for c in await self._provider._repo.get_all()
                if c.category == category
            ]
        return list(await self._provider._repo.get_all())

    async def exists(self, key: str) -> bool:
        """Check if a configuration key exists.

        Args:
            key: Configuration key

        Returns:
            True if the key exists
        """
        return await self._provider._repo.get(key) is not None

    async def create(
        self,
        key: str,
        value: str,
        category: str = "general",
        description: str | None = None,
        is_sensitive: bool = False,
    ) -> SystemConfig:
        """Create a new configuration. Raises ConflictError if key exists.

        Args:
            key: Configuration key (must be unique)
            value: Configuration value
            category: Configuration category
            description: Optional description
            is_sensitive: Whether the value should be encrypted

        Returns:
            Created SystemConfig model

        Raises:
            ConflictError: If key already exists
        """
        from mgmt_server.core.exceptions import ConflictError

        stored_value = value
        if is_sensitive:
            stored_value = self._provider._encrypt(value)

        try:
            config = await self._provider._repo.create(
                key=key,
                value=stored_value,
                category=category,
                description=description,
                is_sensitive=is_sensitive,
            )
        except IntegrityError:
            raise ConflictError(f"Configuration with key '{key}' already exists")

        self._provider._set_cache(key, value)
        return config

    async def set(
        self,
        key: str,
        value: str,
        category: str = "general",
        description: str | None = None,
        is_sensitive: bool = False,
    ) -> None:
        """Set a configuration value.

        Args:
            key: Configuration key
            value: Configuration value
            category: Configuration category
            description: Optional description
            is_sensitive: Whether the value should be encrypted
        """
        await self._provider.set(
            key=key,
            value=value,
            category=category,
            description=description,
            is_sensitive=is_sensitive,
        )

    async def set_partial(
        self,
        key: str,
        value: str,
        description: str | None = None,
    ) -> SystemConfig | None:
        """Update only the given fields of a config, preserving existing category/is_sensitive.

        Returns the updated model, or None if key not found.
        """
        existing = await self._provider._repo.get(key)
        if existing is None:
            return None
        await self._provider.set(
            key=key,
            value=value,
            category=existing.category,
            description=description
            if description is not None
            else existing.description,
            is_sensitive=existing.is_sensitive,
        )
        return await self._provider._repo.get(key)

    async def delete(self, key: str) -> bool:
        """Delete a configuration.

        Args:
            key: Configuration key to delete

        Returns:
            True if deleted, False if not found
        """
        return await self._provider.delete(key)

    async def save_smtp_config(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        use_tls: bool,
        from_email: str,
    ) -> SMTPConfig:
        """Save all SMTP configuration values atomically."""
        await self._provider.bulk_set(
            [
                {
                    "key": "smtp_host",
                    "value": host,
                    "category": "email",
                    "description": "SMTP server hostname",
                },
                {
                    "key": "smtp_port",
                    "value": str(port),
                    "category": "email",
                    "description": "SMTP server port",
                },
                {
                    "key": "smtp_username",
                    "value": username,
                    "category": "email",
                    "description": "SMTP authentication username",
                },
                {
                    "key": "smtp_password",
                    "value": password,
                    "category": "email",
                    "description": "SMTP authentication password",
                    "is_sensitive": True,
                },
                {
                    "key": "smtp_use_tls",
                    "value": str(use_tls).lower(),
                    "category": "email",
                    "description": "Use TLS encryption for SMTP",
                },
                {
                    "key": "smtp_from_email",
                    "value": from_email,
                    "category": "email",
                    "description": "Default sender email address",
                },
            ]
        )
        return SMTPConfig(
            host=host,
            port=port,
            username=username,
            password=password,
            use_tls=use_tls,
            from_email=from_email,
        )

    async def save_hf_endpoint_config(
        self,
        endpoints: list[str],
        default_endpoint: str,
    ) -> HFEndpointConfig:
        """Save HuggingFace endpoint configuration atomically."""
        await self._provider.bulk_set(
            [
                {
                    "key": "hf_endpoints",
                    "value": json.dumps(endpoints),
                    "category": "huggingface",
                    "description": "HuggingFace endpoint list (JSON array)",
                },
                {
                    "key": "hf_default_endpoint",
                    "value": default_endpoint,
                    "category": "huggingface",
                    "description": "Default HuggingFace endpoint",
                },
            ]
        )
        return HFEndpointConfig(
            endpoints=endpoints,
            default_endpoint=default_endpoint,
        )

    async def save_notification_config(
        self,
        email: str,
        task_approval_push: bool,
        auto_approve_enabled: bool,
        auto_approve_threshold_gb: int,
    ) -> NotificationConfig:
        """Save notification configuration atomically."""
        await self._provider.bulk_set(
            [
                {
                    "key": "notification_email",
                    "value": email,
                    "category": "notification",
                    "description": "Notification emails, comma-separated",
                },
                {
                    "key": "notification_task_approval",
                    "value": str(task_approval_push).lower(),
                    "category": "notification",
                    "description": "Push task approval notifications",
                },
                {
                    "key": "auto_approve_enabled",
                    "value": str(auto_approve_enabled).lower(),
                    "category": "notification",
                    "description": "Enable auto-approval",
                },
                {
                    "key": "auto_approve_threshold_gb",
                    "value": str(auto_approve_threshold_gb),
                    "category": "notification",
                    "description": "Auto-approval threshold (GB)",
                },
            ]
        )
        return NotificationConfig(
            email=email,
            task_approval_push=task_approval_push,
            auto_approve_enabled=auto_approve_enabled,
            auto_approve_threshold_gb=auto_approve_threshold_gb,
        )

    async def save_announcement_config(
        self,
        content: str,
        announcement_type: Literal["info", "warning", "urgent"],
        is_active: bool,
    ) -> AnnouncementConfig:
        """Save announcement configuration atomically."""
        await self._provider.bulk_set(
            [
                {
                    "key": "system_announcement",
                    "value": content,
                    "category": "announcement",
                    "description": "System announcement content",
                },
                {
                    "key": "system_announcement_type",
                    "value": announcement_type,
                    "category": "announcement",
                    "description": "Announcement type: info/warning/urgent",
                },
                {
                    "key": "system_announcement_active",
                    "value": str(is_active).lower(),
                    "category": "announcement",
                    "description": "Enable announcement",
                },
            ]
        )
        return AnnouncementConfig(
            content=content,
            announcement_type=announcement_type,
            is_active=is_active,
        )

    async def batch_update(self, items: list[ConfigUpdateItem]) -> None:
        """Batch update configurations atomically."""
        dicts: list[dict] = []
        registered_values: dict[str, str] = {}
        for item in items:
            if ConfigRegistry.has(item.key):
                entry = ConfigRegistry.get(item.key)
                if entry.sensitive and item.value == "":
                    continue
                value = ConfigRegistry.normalize_value(entry.key, item.value)
                registered_values[entry.key.value] = value
                dicts.append(
                    {
                        "key": entry.key.value,
                        "value": value,
                        "category": entry.category.value,
                        "description": entry.description,
                        "is_sensitive": entry.sensitive,
                    }
                )
            else:
                dicts.append(
                    {
                        "key": item.key,
                        "value": item.value,
                        "category": item.category,
                        "description": item.description,
                        "is_sensitive": item.is_sensitive,
                    }
                )
        if registered_values:
            await self._validate_registered_batch(registered_values)
        if dicts:
            await self._provider.bulk_set(dicts)

    async def _validate_registered_batch(self, values: dict[str, str]) -> None:
        await self._validate_hf_batch(values)

    async def _validate_hf_batch(self, values: dict[str, str]) -> None:
        endpoints_key = ConfigKey.HF_ENDPOINTS.value
        default_key = ConfigKey.HF_DEFAULT_ENDPOINT.value
        if endpoints_key not in values and default_key not in values:
            return

        if endpoints_key in values:
            raw = values[endpoints_key]
            parsed = json.loads(raw)
            endpoints = [str(e).strip() for e in parsed if str(e).strip()]
        else:
            endpoints = await self.get_hf_endpoints()

        if default_key in values:
            default_endpoint = values[default_key].strip()
        else:
            default_endpoint = await self.get_hf_default_endpoint()

        if not endpoints:
            raise ValueError("HF endpoints cannot be empty")
        if default_endpoint not in endpoints:
            raise ValueError("Default endpoint must be in the endpoints list")

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

    async def get_hf_config(self) -> HFEndpointConfig:
        """Get HuggingFace endpoint configuration as typed object."""
        endpoints = await self.get_hf_endpoints()
        default = await self.get_hf_default_endpoint()
        return HFEndpointConfig(endpoints=endpoints, default_endpoint=default)

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

    async def get_notification_config(self) -> NotificationConfig:
        """Get notification configuration as typed object."""
        return NotificationConfig(
            email=await self._provider.get("notification_email", ""),
            task_approval_push=await self._provider.get_bool(
                "notification_task_approval", True
            ),
            auto_approve_enabled=await self._provider.get_bool(
                "auto_approve_enabled", False
            ),
            auto_approve_threshold_gb=await self._provider.get_int(
                "auto_approve_threshold_gb", 100
            ),
        )

    async def get_announcement_config(self) -> AnnouncementConfig:
        """Get announcement configuration as typed object."""
        raw_type = await self._provider.get("system_announcement_type", "info")
        announcement_type: Literal["info", "warning", "urgent"] = (
            raw_type if raw_type in ("info", "warning", "urgent") else "info"
        )
        return AnnouncementConfig(
            content=await self._provider.get("system_announcement", ""),
            announcement_type=announcement_type,
            is_active=await self._provider.get_bool("system_announcement_active", True),
        )
