# Cache Key Registry Design

## Problem

1. **Double-prefixing**: `CacheService._prefix` (`mini_hf:`) + `CacheNamespace.name` (`stats:`) are unaware of each other. Changing one silently breaks the other.
2. **Non-discoverable registry**: `CacheKeys` is a flat class with attributes — no way to enumerate namespaces programmatically.
3. **`key()` allows empty parts**: `ns.key()` returns `"namespace"` with no sub-key, defeating prefix scanning.
4. **TTL scattered**: Each consumer defines its own TTL constant, unconnected to the namespace definition.
5. **No key format convention**: Some keys are one word, others compound — no documentation.

## Design

### 1. CacheNamespace — enhanced with metadata

```python
class CacheNamespace:
    __slots__ = ("name", "ttl", "description")

    def __init__(self, name: str, *, ttl: int | None = None, description: str = ""):
        self.name = name
        self.ttl = ttl
        self.description = description

    def key(self, *parts: str) -> str:
        if not parts:
            raise ValueError("key() requires at least one sub-key part")
        return ":".join((self.name, *parts))

    def prefix(self) -> str:
        return f"{self.name}:"
```

- `ttl` — default TTL for this namespace (overridable at `set()` time)
- `description` — human-readable purpose
- `key()` **requires** at least one sub-key part

### 2. CacheKeys — declarative registry with global prefix

```python
class CacheKeys:
    _PREFIX = "mini_hf"

    _NAMESPACES: dict[str, CacheNamespace] = {
        # Infrastructure
        "rate_limit":     CacheNamespace(f"{_PREFIX}:ratelimit",      ttl=None,   description="Rate limiting counters"),
        "refresh_family": CacheNamespace(f"{_PREFIX}:refresh_family", ttl=604800, description="Refresh token family (7d)"),
        "access_revoke":  CacheNamespace(f"{_PREFIX}:access_revoke",  ttl=None,   description="Revoked access token JTI set"),
        # Business
        "stats":          CacheNamespace(f"{_PREFIX}:stats",          ttl=60,     description="Dashboard statistics cache"),
        "trending":       CacheNamespace(f"{_PREFIX}:trending",       ttl=1800,   description="HF trending repos (30min)"),
        "cache_scan":     CacheNamespace(f"{_PREFIX}:cache_scan",     ttl=90000,  description="Cold cache scan results (25h)"),
        "preview_result": CacheNamespace(f"{_PREFIX}:preview_result", ttl=7200,   description="Task preview result cache (2h)"),
        "preview_task":   CacheNamespace(f"{_PREFIX}:preview_task",   ttl=7200,   description="Async preview task state (2h)"),
        "email_verify":   CacheNamespace(f"{_PREFIX}:email_verify",   ttl=300,    description="Email verification codes"),
    }

    @classmethod
    def all(cls) -> dict[str, CacheNamespace]:
        return dict(cls._NAMESPACES)
```

Key format: `mini_hf:stats:dashboard`

### 3. CacheService — remove _prefix

`CacheService._key()` becomes a no-op pass-through:

```python
def _key(self, key: str) -> str:
    return key  # prefix is now controlled by CacheKeys
```

The `_DEFAULT_PREFIX` constant and `prefix` constructor parameter are removed.

### 4. Consumer usage

Before:
```python
await cache.get(CacheKeys.stats.key("dashboard"))
await cache.set(CacheKeys.stats.key("dashboard"), data, ttl=1800)
```

After:
```python
ns = CacheKeys.stats
await cache.get(ns.key("dashboard"))
await cache.set(ns.key("dashboard"), data, ttl=ns.ttl)  # ns.ttl = 60
```

### 5. Migration notes

- `CacheService.__init__` drops the `prefix` parameter (breaking change for direct `CacheService` construction — but all callers use the singleton)
- All existing Redis keys remain identical (`mini_hf:stats:dashboard`), no data migration needed
- `CacheNamespace.key()` now raises `ValueError` on empty parts — existing callers are fine (none use empty parts)
