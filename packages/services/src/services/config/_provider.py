"""Internal configuration provider with caching and encryption.

This is an internal module - external code should use `ConfigService` from
`service.py` instead of accessing this provider directly.

This module provides the low-level configuration management primitives:
- In-memory caching with TTL for performance
- Automatic encryption for sensitive values using Fernet
- Type conversion helpers (int, bool)
- Prefix-based batch retrieval

Note:
    This module is intended for internal use within the services package.
    For business-level configuration access, use `ConfigService` which
    provides higher-level abstractions and typed configuration objects.
"""

import hashlib
import base64
import time
from typing import ClassVar

from loguru import logger
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import AsyncSession

from database.db_repositories.config import ConfigDbRepository


class ConfigProvider:
    """Internal configuration provider with in-memory caching.

    This is an internal class - external code should use `ConfigService`
    from `service.py` for all configuration access.

    Features:
    - In-memory caching with TTL for performance
    - Automatic encryption for sensitive values
    - Type conversion helpers (int, bool)
    - Prefix-based batch retrieval

    Note:
        This class provides low-level primitives for configuration storage.
        For business logic, use `ConfigService` which provides typed
        configuration objects and higher-level abstractions.

    Example (internal use only):
        async def internal_function(db: AsyncSession):
            config = ConfigProvider(db)
            value = await config.get("my_key", default="default_value")
    """

    # Class-level cache storage
    _cache: ClassVar[dict[str, tuple[str, float]]] = {}
    _cache_ttl: ClassVar[int] = 300  # 5 minutes in seconds
    _fernet: ClassVar[Fernet | None] = None

    def __init__(self, session: AsyncSession):
        """Initialize ConfigManager.

        Args:
            session: SQLAlchemy async session
        """
        self._repo = ConfigDbRepository(session)
        self._logger = logger

    @classmethod
    def _get_encryption_key(cls) -> str | None:
        """Get encryption key from settings.

        Returns None if no encryption key is configured.
        """
        from core import settings
        return settings.CONFIG_ENCRYPTION_KEY or settings.JWT_SECRET_KEY

    @classmethod
    def _get_fernet(cls) -> Fernet | None:
        """Get or create Fernet instance for encryption.

        Returns None if no encryption key has been set.
        """
        if cls._fernet is None:
            encryption_key = cls._get_encryption_key()
            if encryption_key:
                # Derive a 32-byte key from the encryption key
                key_bytes = encryption_key.encode()
                # Use SHA-256 to get 32 bytes, then base64 encode for Fernet
                hashed = hashlib.sha256(key_bytes).digest()
                fernet_key = base64.urlsafe_b64encode(hashed)
                cls._fernet = Fernet(fernet_key)
        return cls._fernet

    @classmethod
    def _encrypt(cls, value: str) -> str:
        """Encrypt a sensitive value."""
        fernet = cls._get_fernet()
        if fernet is None:
            return value
        return fernet.encrypt(value.encode()).decode()

    @classmethod
    def _decrypt(cls, value: str) -> str:
        """Decrypt an encrypted value."""
        fernet = cls._get_fernet()
        if fernet is None:
            return value
        try:
            return fernet.decrypt(value.encode()).decode()
        except Exception:
            # If decryption fails, return original value (might not be encrypted)
            return value

    def _get_from_cache(self, key: str) -> tuple[str, float] | None:
        """Get value and timestamp from cache if not expired."""
        if key not in self._cache:
            return None

        value, timestamp = self._cache[key]
        if time.time() - timestamp > self._cache_ttl:
            # Cache expired
            del self._cache[key]
            return None

        return value, timestamp

    def _set_cache(self, key: str, value: str) -> None:
        """Set value in cache with current timestamp."""
        self._cache[key] = (value, time.time())

    @classmethod
    def invalidate(cls, key: str | None = None) -> None:
        """Invalidate cache for a key or all keys.

        Args:
            key: Specific key to invalidate, or None to invalidate all
        """
        if key is None:
            cls._cache.clear()
            logger.info("Config cache cleared")
        elif key in cls._cache:
            del cls._cache[key]
            logger.debug("Config cache invalidated for key: %s", key)

    @classmethod
    def set_cache_ttl(cls, ttl_seconds: int) -> None:
        """Set cache TTL.

        Args:
            ttl_seconds: Cache TTL in seconds
        """
        cls._cache_ttl = ttl_seconds

    async def get(self, key: str, default: str = "") -> str:
        """Get a configuration value with caching.

        Args:
            key: Configuration key
            default: Default value if not found

        Returns:
            Configuration value or default
        """
        # Check cache first
        cached = self._get_from_cache(key)
        if cached is not None:
            logger.debug("Config cache hit for key: {}", key)
            return cached[0]

        # Fetch from database
        config = await self._repo.get(key)
        if config is None:
            logger.debug("Config not found for key: {}, using default", key)
            return default

        # Decrypt if sensitive
        value = config.value
        if config.is_sensitive:
            value = self._decrypt(value)

        # Update cache
        self._set_cache(key, value)
        logger.debug("Config loaded from db for key: {}", key)

        return value

    async def get_int(self, key: str, default: int = 0) -> int:
        """Get a configuration value as integer.

        Args:
            key: Configuration key
            default: Default value if not found or invalid

        Returns:
            Configuration value as integer
        """
        value = await self.get(key, str(default))
        try:
            return int(value)
        except ValueError:
            logger.warning("Config value for %s is not a valid integer: %s", key, value)
            return default

    async def get_bool(self, key: str, default: bool = False) -> bool:
        """Get a configuration value as boolean.

        Args:
            key: Configuration key
            default: Default value if not found

        Returns:
            Configuration value as boolean
        """
        value = await self.get(key, str(default).lower())
        return value.lower() in ("true", "1", "yes", "on")

    async def get_float(self, key: str, default: float = 0.0) -> float:
        """Get a configuration value as float.

        Args:
            key: Configuration key
            default: Default value if not found or invalid

        Returns:
            Configuration value as float
        """
        value = await self.get(key, str(default))
        try:
            return float(value)
        except ValueError:
            logger.warning("Config value for %s is not a valid float: %s", key, value)
            return default

    async def get_by_prefix(self, prefix: str) -> dict[str, str]:
        """Get all configuration values with a given key prefix.

        This is useful for getting all configs in a category,
        e.g., all SMTP configs with prefix "smtp_".

        Args:
            prefix: Key prefix to filter by

        Returns:
            Dictionary of key-value pairs (with prefix stripped)
        """
        configs = await self._repo.get_all()
        result = {}
        for config in configs:
            if config.key.startswith(prefix):
                # Decrypt if sensitive
                value = config.value
                if config.is_sensitive:
                    value = self._decrypt(value)
                # Store with prefix stripped
                stripped_key = config.key[len(prefix) :]
                result[stripped_key] = value
                # Also update cache
                self._set_cache(config.key, value)
        return result

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
        # Encrypt if sensitive
        stored_value = value
        if is_sensitive:
            stored_value = self._encrypt(value)

        # Check if config exists
        existing = await self._repo.get(key)
        if existing:
            await self._repo.update(key, value=stored_value, is_sensitive=is_sensitive)
        else:
            await self._repo.create(
                key=key,
                value=stored_value,
                category=category,
                description=description,
                is_sensitive=is_sensitive,
            )

        # Update cache with plaintext value
        self._set_cache(key, value)
        logger.info("Config updated: %s (category: %s)", key, category)

    async def delete(self, key: str) -> bool:
        """Delete a configuration.

        Args:
            key: Configuration key to delete

        Returns:
            True if deleted, False if not found
        """
        result = await self._repo.delete(key)
        if result:
            self.invalidate(key)
            logger.info("Config deleted: %s", key)
        return result

    async def initialize_defaults(
        self,
        defaults: list[dict],
    ) -> int:
        """Initialize default configurations if they don't exist.

        Args:
            defaults: List of config dicts with keys: key, value, category,
                     description, is_sensitive

        Returns:
            Number of configs created
        """
        count = 0
        for item in defaults:
            existing = await self._repo.get(item["key"])
            if existing is None:
                await self.set(
                    key=item["key"],
                    value=item["value"],
                    category=item.get("category", "general"),
                    description=item.get("description"),
                    is_sensitive=item.get("is_sensitive", False),
                )
                count += 1
                logger.info("Initialized default config: %s", item["key"])
        return count
