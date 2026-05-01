"""Rate-limit dependencies for FastAPI endpoints."""

from fastapi import Request

from core.settings import settings
from mgmt_server.api.deps import CacheServiceDep
from mgmt_server.core.exceptions import RateLimitError
from mgmt_server.core.rate_limiter import RateLimitRule, RateLimiter, get_client_ip

# Pre-built rules from settings
_SIGN_IN_RULE = RateLimitRule(
    requests=settings.RATE_LIMIT_SIGN_IN,
    window=settings.RATE_LIMIT_SIGN_IN_WINDOW,
)
_SEND_VERIFY_CODE_RULE = RateLimitRule(
    requests=settings.RATE_LIMIT_SEND_VERIFY_CODE,
    window=settings.RATE_LIMIT_SEND_VERIFY_CODE_WINDOW,
)
_REGISTER_RULE = RateLimitRule(
    requests=settings.RATE_LIMIT_REGISTER,
    window=settings.RATE_LIMIT_REGISTER_WINDOW,
)


async def rate_limit_sign_in(
    request: Request,
    cache: CacheServiceDep,
) -> None:
    """5 login attempts per minute per client IP."""
    ip = get_client_ip(request)
    limiter = RateLimiter(cache)
    result = await limiter.is_allowed(f"sign-in:{ip}", _SIGN_IN_RULE)
    if not result.allowed:
        raise RateLimitError(retry_after=result.retry_after)


async def rate_limit_send_verify_code(
    request: Request,
    cache: CacheServiceDep,
) -> None:
    """1 verification-code request per minute per client IP."""
    ip = get_client_ip(request)
    limiter = RateLimiter(cache)
    result = await limiter.is_allowed(f"send-verify-code:{ip}", _SEND_VERIFY_CODE_RULE)
    if not result.allowed:
        raise RateLimitError(retry_after=result.retry_after)


async def rate_limit_register(
    request: Request,
    cache: CacheServiceDep,
) -> None:
    """3 registration attempts per minute per client IP."""
    ip = get_client_ip(request)
    limiter = RateLimiter(cache)
    result = await limiter.is_allowed(f"register:{ip}", _REGISTER_RULE)
    if not result.allowed:
        raise RateLimitError(retry_after=result.retry_after)
