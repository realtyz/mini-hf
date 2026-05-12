"""Rate limiting service backed by Redis."""

import time
from dataclasses import dataclass

from loguru import logger

from cache.keys import CacheKeys
from cache.services.cache import CacheService


@dataclass(frozen=True)
class RateLimitRule:
    """A rate limit rule: *requests* calls per *window* seconds."""

    requests: int
    window: int


@dataclass(frozen=True)
class RateLimitResult:
    """Outcome of a rate-limit check."""

    allowed: bool
    remaining: int
    retry_after: int  # seconds to wait before retrying (0 if allowed)


def get_client_ip(request) -> str:
    """Extract client IP from request, with reverse-proxy support.

    Priority: X-Forwarded-For (first entry) > X-Real-IP > request.client.host.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
        if ip:
            return ip

    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()

    if request.client and request.client.host:
        return request.client.host

    return "unknown"


class RateLimiter:
    """Fixed-window rate limiter using Redis INCR for atomic counters.

    Key format: ``ratelimit:{endpoint}:{ip}:{bucket}``
    where *bucket* = ``timestamp // window * window``.
    """

    def __init__(self, cache: CacheService):
        self._cache = cache

    async def is_allowed(self, key: str, rule: RateLimitRule) -> RateLimitResult:
        """Check whether a request identified by *key* is allowed under *rule*.

        Fails open: if Redis is unreachable the request is allowed.
        """
        now = time.time()
        bucket = int(now // rule.window * rule.window)
        full_key = CacheKeys.rate_limit.key(key, str(bucket))

        try:
            count = await self._cache.increment(full_key)
            if count == 1:
                # New bucket — set expiry so keys auto-clean.
                await self._cache.expire(full_key, rule.window)

            if count <= rule.requests:
                return RateLimitResult(
                    allowed=True,
                    remaining=rule.requests - count,
                    retry_after=0,
                )

            ttl = await self._cache.ttl(full_key)
            retry_after = max(ttl, 1) if ttl > 0 else rule.window

            return RateLimitResult(
                allowed=False,
                remaining=0,
                retry_after=retry_after,
            )
        except Exception:
            logger.exception("Rate limit check failed, failing open")
            return RateLimitResult(allowed=True, remaining=1, retry_after=0)
