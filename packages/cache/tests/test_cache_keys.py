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
        names = [ns.name for ns in CacheKeys.all().values()]
        assert len(names) == len(set(names)), f"Duplicate namespace names: {names}"

    def test_all_namespaces_have_descriptions(self):
        for attr_name, ns in CacheKeys.all().items():
            assert ns.description, f"CacheKeys.{attr_name} has empty description"

    def test_all_namespaces_have_expected_prefix(self):
        for ns in CacheKeys.all().values():
            assert ns.name.startswith("mini_hf:"), f"{ns.name} missing prefix"
