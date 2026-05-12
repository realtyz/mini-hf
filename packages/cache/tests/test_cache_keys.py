"""Tests for CacheNamespace and CacheKeys."""

import pytest
from cache.keys import CacheKeys, CacheNamespace


class TestCacheNamespace:
    def test_key_single_part(self):
        ns = CacheNamespace("stats")
        assert ns.key("dashboard") == "stats:dashboard"

    def test_key_multiple_parts(self):
        ns = CacheNamespace("ratelimit")
        assert ns.key("login", "127.0.0.1", "123456") == "ratelimit:login:127.0.0.1:123456"

    def test_key_no_parts(self):
        ns = CacheNamespace("trending")
        assert ns.key() == "trending"

    def test_prefix(self):
        ns = CacheNamespace("stats")
        assert ns.prefix() == "stats:"

    def test_repr(self):
        ns = CacheNamespace("stats")
        assert repr(ns) == "CacheNamespace('stats')"

    def test_slots(self):
        ns = CacheNamespace("test")
        with pytest.raises(AttributeError):
            ns.foo = "bar"


class TestCacheKeys:
    def test_rate_limit_namespace(self):
        assert CacheKeys.rate_limit.name == "ratelimit"
        assert CacheKeys.rate_limit.key("ep", "ip", "bucket") == "ratelimit:ep:ip:bucket"

    def test_stats_namespace(self):
        assert CacheKeys.stats.name == "stats"
        assert CacheKeys.stats.key("dashboard") == "stats:dashboard"
        assert CacheKeys.stats.key("rebuild_lock") == "stats:rebuild_lock"

    def test_trending_namespace(self):
        assert CacheKeys.trending.name == "trending"
        assert CacheKeys.trending.key("data") == "trending:data"

    def test_cache_scan_namespace(self):
        assert CacheKeys.cache_scan.name == "cache_scan"
        assert CacheKeys.cache_scan.key("result") == "cache_scan:result"

    def test_preview_result_namespace(self):
        assert CacheKeys.preview_result.name == "preview_result"
        assert CacheKeys.preview_result.key("abc123") == "preview_result:abc123"

    def test_preview_task_namespace(self):
        assert CacheKeys.preview_task.name == "preview_task"
        assert CacheKeys.preview_task.key("task_1") == "preview_task:task_1"

    def test_email_verify_namespace(self):
        assert CacheKeys.email_verify.name == "email_verify"
        assert CacheKeys.email_verify.key("user@example.com") == "email_verify:user@example.com"

    def test_refresh_family_namespace(self):
        assert CacheKeys.refresh_family.key("fam_1") == "refresh_family:fam_1"

    def test_access_revoke_namespace(self):
        assert CacheKeys.access_revoke.key("jti_1") == "access_revoke:jti_1"

    def test_all_namespaces_have_names(self):
        """Every CacheKeys attribute that is a CacheNamespace must have a non-empty name."""
        for attr_name in dir(CacheKeys):
            if attr_name.startswith("_"):
                continue
            attr = getattr(CacheKeys, attr_name)
            if isinstance(attr, CacheNamespace):
                assert attr.name, f"CacheKeys.{attr_name} has empty name"
