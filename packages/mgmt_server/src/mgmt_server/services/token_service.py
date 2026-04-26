"""Token service for Redis-based token management."""

from __future__ import annotations

import json

from loguru import logger

from cache.services.cache import CacheService
from core.settings import settings

_FAMILY_PREFIX = "refresh_family:"
_FAMILY_TTL = 7 * 24 * 3600  # 7 days, same as refresh token expiry
_ACCESS_REVOKE_PREFIX = "access_revoke:"


class TokenReplayError(Exception):
    """Raised when a reused refresh token is detected (replay attack)."""


class TokenService:
    """Manages refresh token families and access token revocation in Redis."""

    def __init__(self, cache: CacheService):
        self._cache = cache

    def _family_key(self, family_id: str) -> str:
        return f"{_FAMILY_PREFIX}{family_id}"

    def _access_revoke_key(self, jti: str) -> str:
        return f"{_ACCESS_REVOKE_PREFIX}{jti}"

    async def create_family(self, user_id: int, jti: str, family_id: str) -> None:
        """Create a new token family on login.

        Args:
            family_id: The family ID from the refresh token JWT.
        """
        value = json.dumps({"user_id": user_id, "jti": jti})
        await self._cache.set(self._family_key(family_id), value, ttl=_FAMILY_TTL)

    async def validate_and_rotate(
        self,
        family_id: str,
        jti: str,
        new_jti: str,
    ) -> None:
        """Validate current refresh token and rotate to a new one.

        Raises:
            TokenReplayError: If the jti doesn't match (replay detected).
                The entire family is revoked.
        """
        key = self._family_key(family_id)
        raw = await self._cache.get(key)

        if raw is None:
            raise TokenReplayError(f"Token family {family_id} not found or expired")

        data = json.loads(raw) if isinstance(raw, str) else raw

        if data["jti"] != jti:
            # Replay detected — revoke entire family
            await self._cache.delete(key)
            logger.warning(
                "Refresh token replay detected for family {}, "
                "revoking entire family (user_id={})",
                family_id,
                data.get("user_id"),
            )
            raise TokenReplayError(
                f"Replayed token detected in family {family_id}, family revoked"
            )

        # Rotate: update jti
        data["jti"] = new_jti
        await self._cache.set(key, json.dumps(data), ttl=_FAMILY_TTL)

    async def revoke_family(self, family_id: str) -> bool:
        """Revoke an entire token family (used for logout / replay detection).

        Returns:
            True if the family was found and deleted.
        """
        return await self._cache.delete(self._family_key(family_id))

    async def revoke_access_token(self, jti: str) -> bool:
        """Add an access token jti to the revocation list.

        The entry TTL matches the access token expiry so it auto-expires.

        Returns:
            True if set successfully.
        """
        ttl = settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
        return await self._cache.set(self._access_revoke_key(jti), "1", ttl=ttl)

    async def is_access_token_revoked(self, jti: str) -> bool:
        """Check if an access token jti has been revoked."""
        return await self._cache.exists(self._access_revoke_key(jti))
