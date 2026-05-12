"""Cache key namespace registry — single source of truth for all cache keys."""


class CacheNamespace:
    """A logical grouping of related cache keys under a common prefix.

    Usage:
        stats = CacheNamespace("stats")
        stats.key("dashboard")      # → "stats:dashboard"
        stats.key("rebuild_lock")   # → "stats:rebuild_lock"
        stats.prefix()              # → "stats:"
    """

    __slots__ = ("name",)

    def __init__(self, name: str) -> None:
        self.name = name

    def key(self, *parts: str) -> str:
        return ":".join((self.name, *parts))

    def prefix(self) -> str:
        return f"{self.name}:"

    def __repr__(self) -> str:
        return f"CacheNamespace({self.name!r})"


class CacheKeys:
    """Central registry of all cache key namespaces.

    Usage:
        from cache.keys import CacheKeys

        await cache.get(CacheKeys.stats.key("dashboard"))
        await cache.set(CacheKeys.preview_result.key(cache_key), data, ttl=3600)
    """

    # Infrastructure
    rate_limit = CacheNamespace("ratelimit")
    refresh_family = CacheNamespace("refresh_family")
    access_revoke = CacheNamespace("access_revoke")

    # Business: statistics
    stats = CacheNamespace("stats")

    # Business: trending
    trending = CacheNamespace("trending")

    # Business: cache scan
    cache_scan = CacheNamespace("cache_scan")

    # Business: task preview
    preview_result = CacheNamespace("preview_result")
    preview_task = CacheNamespace("preview_task")

    # Business: email
    email_verify = CacheNamespace("email_verify")
