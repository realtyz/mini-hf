"""Redis client for connection management."""

from typing import Awaitable, cast

import redis.asyncio as redis
from redis.asyncio.connection import ConnectionPool

from core import settings


class RedisClient:
    """Redis connection management client.

    Handles connection pooling and provides access to Redis operations.
    """

    def __init__(
        self,
        url: str | None = None,
        encoding: str = "utf-8",
        decode_responses: bool = True,
        max_connections: int = 50,
        socket_connect_timeout: float = 5.0,
        socket_timeout: float = 5.0,
    ):
        """Initialize Redis client.

        Args:
            url: Redis connection URL. Defaults to settings.REDIS_URL.
            encoding: Character encoding for responses.
            decode_responses: Whether to decode responses to strings.
            max_connections: Maximum connections in the pool.
            socket_connect_timeout: Connection timeout in seconds.
            socket_timeout: Socket timeout in seconds.
        """
        self.url = url or settings.REDIS_URL
        self.encoding = encoding
        self.decode_responses = decode_responses
        self.max_connections = max_connections
        self.socket_connect_timeout = socket_connect_timeout
        self.socket_timeout = socket_timeout

        self._pool: ConnectionPool | None = None
        self._redis: redis.Redis | None = None

    def _get_pool(self) -> ConnectionPool:
        """Get or create connection pool."""
        if self._pool is None:
            self._pool = ConnectionPool.from_url(
                self.url,
                encoding=self.encoding,
                decode_responses=self.decode_responses,
                max_connections=self.max_connections,
                socket_connect_timeout=self.socket_connect_timeout,
                socket_timeout=self.socket_timeout,
            )
        return self._pool

    @property
    def redis(self) -> redis.Redis:
        """Get Redis client instance."""
        if self._redis is None:
            self._redis = redis.Redis(connection_pool=self._get_pool())
        return self._redis

    async def ping(self) -> bool:
        """Check if Redis connection is alive.

        Returns:
            True if connection is successful, False otherwise.
        """
        try:
            ping_coro = cast(Awaitable[bool], self.redis.ping())
            return await ping_coro
        except Exception:
            return False

    async def close(self) -> None:
        """Close the connection pool."""
        if self._pool:
            await self._pool.disconnect()
            self._pool = None
            self._redis = None

    async def __aenter__(self) -> "RedisClient":
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Async context manager exit."""
        await self.close()
