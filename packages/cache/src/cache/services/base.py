"""Base service class for cache services."""

from abc import ABC

from cache.client import RedisClient


class BaseService(ABC):
    """Abstract base class for all cache services.

    Provides common functionality for services that operate on Redis.
    """

    def __init__(self, client: RedisClient | None = None):
        """Initialize the service.

        Args:
            client: Redis client instance. If None, creates a new client.
        """
        self._client = client or RedisClient()

    @property
    def client(self) -> RedisClient:
        """Get the Redis client."""
        return self._client

    @property
    def redis(self):
        """Get the Redis connection."""
        return self._client.redis
