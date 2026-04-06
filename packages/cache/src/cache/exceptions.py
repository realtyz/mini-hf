"""Cache-related exceptions."""

__all__ = ["CacheException", "SerializationError", "RedisConnectionError"]


class CacheException(Exception):
    """Base exception for cache operations."""

    pass


class SerializationError(CacheException):
    """Raised when serialization/deserialization fails."""

    pass


class RedisConnectionError(CacheException):
    """Raised when Redis connection fails."""

    pass
