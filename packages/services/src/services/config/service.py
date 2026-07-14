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
class TaskControlConfig:
    """Typed task control configuration."""

    max_per_user: int


@dataclass
class HFEndpointConfig:
    """Typed HuggingFace endpoint configuration."""

    endpoints: list[str]
    default_endpoint: str


@dataclass
class MSEndpointConfig:
    """Typed ModelScope endpoint configuration."""

    endpoints: list[str]
    default_endpoint: str


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
        return list(await self._provider._repo.get_all(category=category))

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

    async def save_smtp_config(self, smtp: SMTPConfig) -> SMTPConfig:
        """Save all SMTP configuration values atomically."""
        values: dict[ConfigKey, object] = {
            ConfigKey.SMTP_HOST: smtp.host,
            ConfigKey.SMTP_PORT: smtp.port,
            ConfigKey.SMTP_USERNAME: smtp.username,
            ConfigKey.SMTP_PASSWORD: smtp.password,
            ConfigKey.SMTP_USE_TLS: smtp.use_tls,
            ConfigKey.SMTP_FROM_EMAIL: smtp.from_email,
        }
        items = ConfigRegistry.build_save_dicts(values)
        await self._provider.bulk_set(items)
        return smtp

    @staticmethod
    def _clean_endpoints(endpoints: list[str]) -> list[str]:
        return [e.strip() for e in endpoints if e.strip()]

    @staticmethod
    def _validate_hf_consistency(endpoints: list[str], default_endpoint: str) -> None:
        if not endpoints:
            raise ValueError("HF endpoints cannot be empty")
        if default_endpoint not in endpoints:
            raise ValueError("Default endpoint must be in the endpoints list")

    @staticmethod
    def _validate_ms_consistency(endpoints: list[str], default_endpoint: str) -> None:
        if not endpoints:
            raise ValueError("MS endpoints cannot be empty")
        if default_endpoint not in endpoints:
            raise ValueError("Default endpoint must be in the endpoints list")

    async def save_hf_endpoint_config(self, hf: HFEndpointConfig) -> HFEndpointConfig:
        """Save HuggingFace endpoint configuration atomically."""
        cleaned_endpoints = self._clean_endpoints(hf.endpoints)
        cleaned_default = hf.default_endpoint.strip()
        self._validate_hf_consistency(cleaned_endpoints, cleaned_default)

        values: dict[ConfigKey, object] = {
            ConfigKey.HF_ENDPOINTS: cleaned_endpoints,
            ConfigKey.HF_DEFAULT_ENDPOINT: cleaned_default,
        }
        items = ConfigRegistry.build_save_dicts(values)
        await self._provider.bulk_set(items)
        return HFEndpointConfig(endpoints=cleaned_endpoints, default_endpoint=cleaned_default)

    async def save_ms_endpoint_config(self, ms: MSEndpointConfig) -> MSEndpointConfig:
        """Save ModelScope endpoint configuration atomically."""
        cleaned_endpoints = self._clean_endpoints(ms.endpoints)
        cleaned_default = ms.default_endpoint.strip()
        self._validate_ms_consistency(cleaned_endpoints, cleaned_default)

        values: dict[ConfigKey, object] = {
            ConfigKey.MS_ENDPOINTS: cleaned_endpoints,
            ConfigKey.MS_DEFAULT_ENDPOINT: cleaned_default,
        }
        items = ConfigRegistry.build_save_dicts(values)
        await self._provider.bulk_set(items)
        return MSEndpointConfig(endpoints=cleaned_endpoints, default_endpoint=cleaned_default)

    async def save_notification_config(self, notif: NotificationConfig) -> NotificationConfig:
        """Save notification configuration atomically."""
        values: dict[ConfigKey, object] = {
            ConfigKey.NOTIFICATION_EMAIL: notif.email,
            ConfigKey.NOTIFICATION_TASK_APPROVAL: notif.task_approval_push,
            ConfigKey.AUTO_APPROVE_ENABLED: notif.auto_approve_enabled,
            ConfigKey.AUTO_APPROVE_THRESHOLD_GB: notif.auto_approve_threshold_gb,
        }
        items = ConfigRegistry.build_save_dicts(values)
        await self._provider.bulk_set(items)
        return notif

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
        await self._validate_ms_batch(values)

    async def _validate_hf_batch(self, values: dict[str, str]) -> None:
        endpoints_key = ConfigKey.HF_ENDPOINTS.value
        default_key = ConfigKey.HF_DEFAULT_ENDPOINT.value
        if endpoints_key not in values and default_key not in values:
            return

        if endpoints_key in values:
            raw = values[endpoints_key]
            parsed = json.loads(raw)
            endpoints = self._clean_endpoints([str(e) for e in parsed])
        else:
            endpoints = await self.get_hf_endpoints()

        if default_key in values:
            default_endpoint = values[default_key].strip()
        else:
            default_endpoint = await self.get_hf_default_endpoint()

        self._validate_hf_consistency(endpoints, default_endpoint)

    async def _validate_ms_batch(self, values: dict[str, str]) -> None:
        endpoints_key = ConfigKey.MS_ENDPOINTS.value
        default_key = ConfigKey.MS_DEFAULT_ENDPOINT.value
        if endpoints_key not in values and default_key not in values:
            return

        if endpoints_key in values:
            raw = values[endpoints_key]
            parsed = json.loads(raw)
            endpoints = self._clean_endpoints([str(e) for e in parsed])
        else:
            endpoints = await self.get_ms_endpoints()

        if default_key in values:
            default_endpoint = values[default_key].strip()
        else:
            default_endpoint = await self.get_ms_default_endpoint()

        self._validate_ms_consistency(endpoints, default_endpoint)

    async def get_smtp_config(self) -> SMTPConfig:
        return SMTPConfig(
            host=await self._provider.get(ConfigKey.SMTP_HOST),
            port=await self._provider.get_int(
                ConfigKey.SMTP_PORT,
                ConfigRegistry.get_default(ConfigKey.SMTP_PORT),
            ),
            username=await self._provider.get(ConfigKey.SMTP_USERNAME),
            password=await self._provider.get(ConfigKey.SMTP_PASSWORD),
            use_tls=await self._provider.get_bool(
                ConfigKey.SMTP_USE_TLS,
                ConfigRegistry.get_default(ConfigKey.SMTP_USE_TLS),
            ),
            from_email=await self._provider.get(ConfigKey.SMTP_FROM_EMAIL),
        )

    async def get_hf_endpoints(self) -> list[str]:
        """Get list of configured HF endpoints."""
        raw = await self._provider.get(ConfigKey.HF_ENDPOINTS, "[]")
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
            ConfigKey.HF_DEFAULT_ENDPOINT, "https://huggingface.co"
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

    async def get_ms_endpoints(self) -> list[str]:
        """Get list of configured ModelScope endpoints."""
        raw = await self._provider.get(ConfigKey.MS_ENDPOINTS, "[]")
        try:
            endpoints = json.loads(raw)
            if isinstance(endpoints, list):
                return [str(e).strip() for e in endpoints if str(e).strip()]
        except (json.JSONDecodeError, TypeError):
            pass
        return ["https://modelscope.cn"]

    async def get_ms_default_endpoint(self) -> str:
        """Get default ModelScope endpoint."""
        endpoints = await self.get_ms_endpoints()
        default = await self._provider.get(
            ConfigKey.MS_DEFAULT_ENDPOINT, "https://modelscope.cn"
        )
        default = str(default).strip()
        if default in endpoints:
            return default
        return endpoints[0] if endpoints else "https://modelscope.cn"

    async def get_ms_config(self) -> MSEndpointConfig:
        """Get ModelScope endpoint configuration as typed object."""
        endpoints = await self.get_ms_endpoints()
        default = await self.get_ms_default_endpoint()
        return MSEndpointConfig(endpoints=endpoints, default_endpoint=default)

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
        return NotificationConfig(
            email=await self._provider.get(
                ConfigKey.NOTIFICATION_EMAIL,
                ConfigRegistry.get_default(ConfigKey.NOTIFICATION_EMAIL),
            ),
            task_approval_push=await self._provider.get_bool(
                ConfigKey.NOTIFICATION_TASK_APPROVAL,
                ConfigRegistry.get_default(ConfigKey.NOTIFICATION_TASK_APPROVAL),
            ),
            auto_approve_enabled=await self._provider.get_bool(
                ConfigKey.AUTO_APPROVE_ENABLED,
                ConfigRegistry.get_default(ConfigKey.AUTO_APPROVE_ENABLED),
            ),
            auto_approve_threshold_gb=await self._provider.get_int(
                ConfigKey.AUTO_APPROVE_THRESHOLD_GB,
                ConfigRegistry.get_default(ConfigKey.AUTO_APPROVE_THRESHOLD_GB),
            ),
        )

    async def get_task_control_config(self) -> TaskControlConfig:
        return TaskControlConfig(
            max_per_user=await self._provider.get_int(
                ConfigKey.TASK_MAX_PER_USER,
                ConfigRegistry.get_default(ConfigKey.TASK_MAX_PER_USER),
            ),
        )

