"""Cache key namespace registry — single source of truth for all cache keys."""


class CacheNamespace:
    """A logical grouping of related cache keys under a common prefix.

    Usage:
        stats = CacheNamespace("mini_hf:stats", ttl=60, description="Dashboard stats")
        stats.key("dashboard")      # → "mini_hf:stats:dashboard"
        stats.key("rebuild_lock")   # → "mini_hf:stats:rebuild_lock"
        stats.prefix()              # → "mini_hf:stats:"
        stats.ttl                   # → 60
    """

    __slots__ = ("name", "ttl", "description")

    def __init__(self, name: str, *, ttl: int | None = None, description: str = "") -> None:
        self.name = name
        self.ttl = ttl
        self.description = description

    def key(self, *parts: str) -> str:
        if not parts:
            raise ValueError("CacheNamespace.key() requires at least one sub-key part")
        return ":".join((self.name, *parts))

    def prefix(self) -> str:
        return f"{self.name}:"

    def __repr__(self) -> str:
        return f"CacheNamespace({self.name!r})"


class CacheKeys:
    """Central registry of all cache key namespaces.

    Usage:
        from cache.keys import CacheKeys

        ns = CacheKeys.stats
        await cache.get(ns.key("dashboard"))
        await cache.set(ns.key("dashboard"), data, ttl=ns.ttl)

        # Enumerate all namespaces
        for name, ns in CacheKeys.all().items():
            print(f"{name}: {ns.description}")
    """

    _PREFIX = "mini_hf"

    # Infrastructure
    rate_limit: CacheNamespace
    refresh_family: CacheNamespace
    access_revoke: CacheNamespace
    # Business
    stats: CacheNamespace
    trending: CacheNamespace
    cache_scan: CacheNamespace
    preview_result: CacheNamespace
    preview_task: CacheNamespace
    email_verify: CacheNamespace

    _NAMESPACES: dict[str, CacheNamespace] = {
        # Infrastructure
        "rate_limit": CacheNamespace(
            f"{_PREFIX}:ratelimit",
            ttl=None,
            description="Rate limiting counters",
        ),
        "refresh_family": CacheNamespace(
            f"{_PREFIX}:refresh_family",
            ttl=604800,
            description="Refresh token family (7d)",
        ),
        "access_revoke": CacheNamespace(
            f"{_PREFIX}:access_revoke",
            ttl=None,
            description="Revoked access token JTI set",
        ),
        # Business
        "stats": CacheNamespace(
            f"{_PREFIX}:stats",
            ttl=60,
            description="Dashboard statistics cache",
        ),
        "trending": CacheNamespace(
            f"{_PREFIX}:trending",
            ttl=1800,
            description="HF trending repos (30min)",
        ),
        "cache_scan": CacheNamespace(
            f"{_PREFIX}:cache_scan",
            ttl=90000,
            description="Cold cache scan results (25h)",
        ),
        "preview_result": CacheNamespace(
            f"{_PREFIX}:preview_result",
            ttl=300,
            description="Task preview result cache (5min)",
        ),
        "preview_task": CacheNamespace(
            f"{_PREFIX}:preview_task",
            ttl=600,
            description="Async preview task state (10min)",
        ),
        "email_verify": CacheNamespace(
            f"{_PREFIX}:email_verify",
            ttl=300,
            description="Email verification codes",
        ),
    }

    @classmethod
    def all(cls) -> dict[str, CacheNamespace]:
        return dict(cls._NAMESPACES)


for _attr, _ns in CacheKeys._NAMESPACES.items():
    setattr(CacheKeys, _attr, _ns)
