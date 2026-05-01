"""Shared dependency providers.

Leaf-level providers that have no cross-dependencies, safe to import from any module.
"""

from fastapi import Request

from cache.services.cache import CacheService


async def get_cache_service(request: Request) -> CacheService:
    """Get the application-owned cache service."""
    return request.app.state.cache_service
