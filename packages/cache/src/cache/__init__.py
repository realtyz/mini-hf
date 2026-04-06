"""Cache library for Redis-based caching operations.

This package provides a layered architecture for caching:
- RedisClient: Low-level connection management
- CacheService: High-level key-value operations

Example:
    from cache import cache_service

    # Set a value
    await cache_service.set("user:123", {"name": "Alice"}, ttl=3600)

    # Get a value
    user = await cache_service.get("user:123")
"""

from cache.client import RedisClient
from cache.services import CacheService

# Global instances for convenient access
redis_client = RedisClient()
cache_service = CacheService(client=redis_client)

__all__ = [
    "RedisClient",
    "CacheService",
    "redis_client",
    "cache_service",
]
