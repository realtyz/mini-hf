"""Cache service for key-value operations."""

from typing import Any, Callable

from cache.client import RedisClient
from cache.serializers import JSONSerializer, Serializer
from cache.services.base import BaseService


class CacheService(BaseService):
    """Service for general key-value caching operations.

    Supports serialization, TTL, and key prefixing.
    """

    def __init__(
        self,
        client: RedisClient | None = None,
        serializer: Serializer | None = None,
        default_ttl: int | None = None,
    ):
        """Initialize cache service.

        Args:
            client: Redis client instance.
            serializer: Value serializer. Defaults to JSONSerializer.
            default_ttl: Default TTL in seconds. None means no expiration.
        """
        super().__init__(client)
        self._serializer = serializer or JSONSerializer()
        self._default_ttl = default_ttl

    def _key(self, key: str) -> str:
        return key

    async def get(self, key: str) -> Any | None:
        """Get value from cache.

        Args:
            key: Cache key.

        Returns:
            Deserialized value or None if not found.
        """
        data = await self.redis.get(self._key(key))
        return self._serializer.deserialize(data)

    async def set(
        self,
        key: str,
        value: Any,
        ttl: int | None = None,
    ) -> bool:
        """Set value in cache.

        Args:
            key: Cache key.
            value: Value to store (will be serialized).
            ttl: Time-to-live in seconds. Uses default_ttl if not specified.

        Returns:
            True if set successfully.
        """
        ttl = ttl if ttl is not None else self._default_ttl
        serialized = self._serializer.serialize(value)

        if ttl is not None:
            await self.redis.setex(self._key(key), ttl, serialized)
        else:
            await self.redis.set(self._key(key), serialized)
        return True

    async def delete(self, key: str) -> bool:
        """Delete key from cache.

        Args:
            key: Cache key.

        Returns:
            True if key was deleted, False if key didn't exist.
        """
        result = await self.redis.delete(self._key(key))
        return result > 0

    async def set_nx(self, key: str, value: str, ttl: int) -> bool:
        """Set key only if not exists (SET NX EX), useful for distributed locks.

        Args:
            key: Cache key.
            value: Value to set.
            ttl: Time-to-live in seconds.

        Returns:
            True if the key was set (lock acquired), False otherwise.
        """
        result = await self.redis.set(self._key(key), value, nx=True, ex=ttl)
        return result is not None

    async def exists(self, key: str) -> bool:
        """Check if key exists in cache.

        Args:
            key: Cache key.

        Returns:
            True if key exists.
        """
        return await self.redis.exists(self._key(key)) > 0

    async def ttl(self, key: str) -> int:
        """Get remaining TTL for a key.

        Args:
            key: Cache key.

        Returns:
            TTL in seconds. -1 if key has no TTL. -2 if key doesn't exist.
        """
        return await self.redis.ttl(self._key(key))

    async def mget(self, keys: list[str]) -> list[Any | None]:
        """Get multiple values from cache.

        Args:
            keys: List of cache keys.

        Returns:
            List of deserialized values (None for missing keys).
        """
        if not keys:
            return []

        full_keys = [self._key(k) for k in keys]
        values = await self.redis.mget(full_keys)
        return [self._serializer.deserialize(v) for v in values]

    async def mset(
        self,
        mapping: dict[str, Any],
        ttl: int | None = None,
    ) -> bool:
        """Set multiple key-value pairs.

        Args:
            mapping: Dictionary of key-value pairs.
            ttl: Time-to-live in seconds for all keys.

        Returns:
            True if set successfully.
        """
        if not mapping:
            return True

        ttl = ttl if ttl is not None else self._default_ttl
        serialized_mapping = {
            self._key(k): self._serializer.serialize(v) for k, v in mapping.items()
        }

        pipe = self.redis.pipeline()
        pipe.mset(serialized_mapping)
        if ttl is not None:
            for key in serialized_mapping:
                pipe.expire(key, ttl)
        await pipe.execute()

        return True

    async def delete_many(self, keys: list[str]) -> int:
        """Delete multiple keys from cache.

        Args:
            keys: List of cache keys.

        Returns:
            Number of keys deleted.
        """
        if not keys:
            return 0

        full_keys = [self._key(k) for k in keys]
        return await self.redis.delete(*full_keys)

    async def get_or_set(
        self,
        key: str,
        default: Callable[[], Any],
        ttl: int | None = None,
    ) -> Any:
        """Get value from cache or set it if not exists.

        Args:
            key: Cache key.
            default: Callable that returns the default value.
            ttl: Time-to-live in seconds.

        Returns:
            Cached value or newly computed value.
        """
        value = await self.get(key)
        if value is not None:
            return value

        value = default()
        await self.set(key, value, ttl)
        return value

    async def increment(self, key: str, amount: int = 1) -> int:
        """Increment a numeric value atomically.

        Args:
            key: Cache key.
            amount: Amount to increment by.

        Returns:
            New value after increment.
        """
        return await self.redis.incrby(self._key(key), amount)

    async def decrement(self, key: str, amount: int = 1) -> int:
        """Decrement a numeric value atomically.

        Args:
            key: Cache key.
            amount: Amount to decrement by.

        Returns:
            New value after decrement.
        """
        return await self.redis.decrby(self._key(key), amount)

    async def keys(self, pattern: str) -> list[str]:
        """Find keys matching a pattern.

        Args:
            pattern: Redis key pattern (e.g., "mini_hf:stats:*").

        Returns:
            List of matching keys.
        """
        matching = await self.redis.keys(pattern)
        return list(matching)

    async def scan_iter(self, pattern: str, count: int = 100) -> list[str]:
        """Iterate keys matching a pattern using SCAN (non-blocking).

        Unlike keys(), this uses Redis SCAN which is O(1) per iteration
        and safe for production use with large datasets.

        Args:
            pattern: Redis key pattern (e.g., "mini_hf:stats:*").
            count: Hint for number of keys per SCAN iteration.

        Returns:
            List of matching keys.
        """
        result: list[str] = []
        async for key in self.redis.scan_iter(match=pattern, count=count):
            result.append(key)
        return result

    async def clear_pattern(self, pattern: str) -> int:
        """Delete all keys matching a pattern.

        Args:
            pattern: Redis key pattern.

        Returns:
            Number of keys deleted.
        """
        matching = await self.scan_iter(pattern)
        if matching:
            return await self.delete_many(matching)
        return 0

    async def clear_all(self) -> int:
        """Clear all keys in the cache.

        Returns:
            Number of keys deleted.

        Warning: Use with caution in production.
        """
        return await self.clear_pattern("*")
