# Cache Key Registry Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor cache key management: eliminate double-prefixing, make the registry declarative and discoverable, associate TTLs with namespaces, and enforce non-empty sub-keys.

**Architecture:** `CacheNamespace` gains `ttl` and `description` metadata. `CacheKeys` becomes a declarative `_NAMESPACES` dict with a global `_PREFIX`, removing the need for `CacheService._prefix`. Redis keys remain identical — no data migration.

**Tech Stack:** Python 3.12+, pytest, Redis

---

### Task 1: Update CacheNamespace

**Files:**
- Modify: `packages/cache/src/cache/keys.py` (full rewrite)

**Step 1: Write the updated class**

```python
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
```

**Step 2: Run existing tests to see what breaks**

```bash
uv run pytest packages/cache/tests/test_cache_keys.py -v
```

Expected: `test_key_no_parts` will fail (now raises ValueError). Other tests will fail because `CacheKeys` hasn't been updated yet.

**Step 3: Skip for now, continue to Task 2**

---

### Task 2: Update CacheKeys to declarative registry

**Files:**
- Modify: `packages/cache/src/cache/keys.py` (append after CacheNamespace)

**Step 1: Add the declarative CacheKeys class**

```python
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
            ttl=7200,
            description="Task preview result cache (2h)",
        ),
        "preview_task": CacheNamespace(
            f"{_PREFIX}:preview_task",
            ttl=7200,
            description="Async preview task state (2h)",
        ),
        "email_verify": CacheNamespace(
            f"{_PREFIX}:email_verify",
            ttl=300,
            description="Email verification codes",
        ),
    }

    # Auto-generate class attributes from _NAMESPACES
    for _attr, _ns in _NAMESPACES.items():
        locals()[_attr] = _ns

    @classmethod
    def all(cls) -> dict[str, CacheNamespace]:
        return dict(cls._NAMESPACES)
```

**Step 2: Run existing tests**

```bash
uv run pytest packages/cache/tests/test_cache_keys.py -v
```

Expected: Several tests fail due to `key()` now raising on empty parts and attribute value changes.

---

### Task 3: Update cache key tests

**Files:**
- Modify: `packages/cache/tests/test_cache_keys.py` (full rewrite)

**Step 1: Write all updated tests**

```python
"""Tests for CacheNamespace and CacheKeys."""

import pytest
from cache.keys import CacheKeys, CacheNamespace


class TestCacheNamespace:
    def test_key_single_part(self):
        ns = CacheNamespace("mini_hf:stats", ttl=60)
        assert ns.key("dashboard") == "mini_hf:stats:dashboard"

    def test_key_multiple_parts(self):
        ns = CacheNamespace("mini_hf:ratelimit")
        assert ns.key("login", "127.0.0.1", "123456") == "mini_hf:ratelimit:login:127.0.0.1:123456"

    def test_key_empty_parts_raises(self):
        ns = CacheNamespace("mini_hf:trending")
        with pytest.raises(ValueError, match="at least one sub-key"):
            ns.key()

    def test_prefix(self):
        ns = CacheNamespace("mini_hf:stats")
        assert ns.prefix() == "mini_hf:stats:"

    def test_ttl(self):
        ns = CacheNamespace("mini_hf:test", ttl=300)
        assert ns.ttl == 300

    def test_ttl_default_none(self):
        ns = CacheNamespace("mini_hf:test")
        assert ns.ttl is None

    def test_description(self):
        ns = CacheNamespace("mini_hf:test", description="Test cache")
        assert ns.description == "Test cache"

    def test_description_default_empty(self):
        ns = CacheNamespace("mini_hf:test")
        assert ns.description == ""

    def test_repr(self):
        ns = CacheNamespace("mini_hf:stats")
        assert repr(ns) == "CacheNamespace('mini_hf:stats')"

    def test_slots(self):
        ns = CacheNamespace("mini_hf:test")
        with pytest.raises(AttributeError):
            ns.foo = "bar"


class TestCacheKeys:
    def test_rate_limit_namespace(self):
        assert CacheKeys.rate_limit.name == "mini_hf:ratelimit"
        assert CacheKeys.rate_limit.ttl is None
        assert CacheKeys.rate_limit.key("ep", "ip", "bucket") == "mini_hf:ratelimit:ep:ip:bucket"

    def test_stats_namespace(self):
        assert CacheKeys.stats.name == "mini_hf:stats"
        assert CacheKeys.stats.ttl == 60
        assert CacheKeys.stats.key("dashboard") == "mini_hf:stats:dashboard"
        assert CacheKeys.stats.key("rebuild_lock") == "mini_hf:stats:rebuild_lock"

    def test_trending_namespace(self):
        assert CacheKeys.trending.name == "mini_hf:trending"
        assert CacheKeys.trending.ttl == 1800
        assert CacheKeys.trending.key("data") == "mini_hf:trending:data"

    def test_cache_scan_namespace(self):
        assert CacheKeys.cache_scan.name == "mini_hf:cache_scan"
        assert CacheKeys.cache_scan.ttl == 90000
        assert CacheKeys.cache_scan.key("result") == "mini_hf:cache_scan:result"

    def test_preview_result_namespace(self):
        assert CacheKeys.preview_result.name == "mini_hf:preview_result"
        assert CacheKeys.preview_result.ttl == 7200
        assert CacheKeys.preview_result.key("abc123") == "mini_hf:preview_result:abc123"

    def test_preview_task_namespace(self):
        assert CacheKeys.preview_task.name == "mini_hf:preview_task"
        assert CacheKeys.preview_task.ttl == 7200
        assert CacheKeys.preview_task.key("task_1") == "mini_hf:preview_task:task_1"

    def test_email_verify_namespace(self):
        assert CacheKeys.email_verify.name == "mini_hf:email_verify"
        assert CacheKeys.email_verify.ttl == 300
        assert CacheKeys.email_verify.key("user@example.com") == "mini_hf:email_verify:user@example.com"

    def test_refresh_family_namespace(self):
        assert CacheKeys.refresh_family.ttl == 604800
        assert CacheKeys.refresh_family.key("fam_1") == "mini_hf:refresh_family:fam_1"

    def test_access_revoke_namespace(self):
        assert CacheKeys.access_revoke.ttl is None
        assert CacheKeys.access_revoke.key("jti_1") == "mini_hf:access_revoke:jti_1"

    def test_all_returns_all_namespaces(self):
        all_ns = CacheKeys.all()
        assert isinstance(all_ns, dict)
        assert len(all_ns) == 9
        assert "stats" in all_ns
        assert "rate_limit" in all_ns
        assert all_ns["stats"].name == "mini_hf:stats"

    def test_all_returns_copy(self):
        copy1 = CacheKeys.all()
        copy2 = CacheKeys.all()
        assert copy1 is not copy2
        assert copy1 == copy2

    def test_namespace_names_are_unique(self):
        """Verify no duplicate name values across namespaces."""
        names = [ns.name for ns in CacheKeys.all().values()]
        assert len(names) == len(set(names)), f"Duplicate namespace names: {names}"

    def test_all_namespaces_have_descriptions(self):
        for attr_name, ns in CacheKeys.all().items():
            assert ns.description, f"CacheKeys.{attr_name} has empty description"

    def test_all_namespaces_have_expected_prefix(self):
        for ns in CacheKeys.all().values():
            assert ns.name.startswith("mini_hf:"), f"{ns.name} missing prefix"
```

**Step 2: Run the tests**

```bash
uv run pytest packages/cache/tests/test_cache_keys.py -v
```

Expected: Most tests pass. Some may fail due to `CacheService._prefix` still being active (the `_key()` method still prepends `mini_hf:` to already-prefixed keys).

---

### Task 4: Remove _prefix from CacheService

**Files:**
- Modify: `packages/cache/src/cache/services/cache.py`

**Step 1: Update CacheService.__init__**

Remove `prefix` parameter and `self._prefix`. Change `_key()` to a passthrough. Update `keys()` and `scan_iter()` to stop stripping prefix.

Changes to `__init__`:
```python
def __init__(
    self,
    client: RedisClient | None = None,
    serializer: Serializer | None = None,
    default_ttl: int | None = None,
):
    super().__init__(client)
    self._serializer = serializer or JSONSerializer()
    self._default_ttl = default_ttl
```

Changes to `_key`:
```python
def _key(self, key: str) -> str:
    return key
```

Changes to `keys`:
```python
async def keys(self, pattern: str) -> list[str]:
    matching = await self.redis.keys(pattern)
    return list(matching)
```

Changes to `scan_iter`:
```python
async def scan_iter(self, pattern: str, count: int = 100) -> list[str]:
    result: list[str] = []
    async for key in self.redis.scan_iter(match=pattern, count=count):
        result.append(key)
    return result
```

Also remove the `_DEFAULT_PREFIX` constant at module level.

**Step 2: Run all cache tests**

```bash
uv run pytest packages/cache/tests/ -v
```

Expected: All tests pass.

---

### Task 5: Commit core changes

```bash
git add packages/cache/src/cache/keys.py \
        packages/cache/src/cache/services/cache.py \
        packages/cache/tests/test_cache_keys.py
git commit -m "refactor: make CacheKeys declarative, consolidate prefix into registry"
```

---

### Task 6: Update consumer — cache_scan_service

**Files:**
- Modify: `packages/mgmt_server/src/mgmt_server/services/cache_scan_service.py`

Replace `_CACHE_TTL = 90000` usage with `CacheKeys.cache_scan.ttl`.

**Step 1: Remove the constant and use namespace TTL**

Replace line 25 (`_CACHE_TTL = 90000`) — delete. Then update the `set()` call at line 135 to use `CacheKeys.cache_scan.ttl`.

**Step 2: Run tests**

```bash
uv run pytest packages/mgmt_server/ -k "cache_scan" -v
```

---

### Task 7: Update consumer — trending endpoint

**Files:**
- Modify: `packages/mgmt_server/src/mgmt_server/api/v1/endpoints/trending.py`

Replace `_CACHE_TTL = 1800` with `CacheKeys.trending.ttl`.

---

### Task 8: Update consumer — dashboard_service

**Files:**
- Modify: `packages/mgmt_server/src/mgmt_server/services/dashboard_service.py`

The dashboard cache has two TTLs (logical=60, physical=1800). The namespace TTL (60) replaces `_CACHE_LOGICAL_TTL`. `_CACHE_PHYSICAL_TTL` stays as it's an implementation detail of the stale-while-revalidate pattern.

**Step 1: Replace `_CACHE_LOGICAL_TTL` usage with `CacheKeys.stats.ttl`**

---

### Task 9: Verify full test suite

```bash
uv run pytest -v
```

---

### Task 10: Final commit

```bash
git add packages/mgmt_server/
git commit -m "refactor: use namespace TTL in consumers, remove scattered TTL constants"
```
