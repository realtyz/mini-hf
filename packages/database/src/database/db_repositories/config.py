"""System configuration repository."""

from typing import Sequence
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database.db_models import SystemConfig


class ConfigDbRepository:
    """Repository for system configuration operations."""

    def __init__(self, session: AsyncSession):
        self._session = session

    async def get(self, key: str) -> SystemConfig | None:
        """Get a configuration by key."""
        stmt = select(SystemConfig).where(SystemConfig.key == key)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all(self, category: str | None = None) -> Sequence[SystemConfig]:
        """Get all configurations, optionally filtered by category."""
        stmt = select(SystemConfig)
        if category:
            stmt = stmt.where(SystemConfig.category == category)
        stmt = stmt.order_by(SystemConfig.category, SystemConfig.key)
        result = await self._session.execute(stmt)
        return result.scalars().all()

    async def create(
        self,
        key: str,
        value: str,
        category: str = "general",
        description: str | None = None,
        is_sensitive: bool = False,
    ) -> SystemConfig:
        """Create a new configuration."""
        config = SystemConfig(
            key=key,
            value=value,
            category=category,
            description=description,
            is_sensitive=is_sensitive,
        )
        self._session.add(config)
        await self._session.commit()
        await self._session.refresh(config)
        return config

    async def update(
        self,
        key: str,
        value: str | None = None,
        description: str | None = None,
        is_sensitive: bool | None = None,
    ) -> SystemConfig | None:
        """Update a configuration."""
        config = await self.get(key)
        if not config:
            return None

        if value is not None:
            config.value = value
        if description is not None:
            config.description = description
        if is_sensitive is not None:
            config.is_sensitive = is_sensitive

        await self._session.commit()
        await self._session.refresh(config)
        return config

    async def delete(self, key: str) -> bool:
        """Delete a configuration."""
        config = await self.get(key)
        if not config:
            return False

        await self._session.delete(config)
        await self._session.commit()
        return True

    async def get_by_category(self, category: str) -> Sequence[SystemConfig]:
        """Get all configurations in a category."""
        stmt = (
            select(SystemConfig)
            .where(SystemConfig.category == category)
            .order_by(SystemConfig.key)
        )
        result = await self._session.execute(stmt)
        return result.scalars().all()

    async def bulk_update(
        self,
        updates: list[dict],
    ) -> int:
        """Bulk update configurations.

        Args:
            updates: List of dicts with 'key' and 'value' keys
            user_id: ID of user making the update

        Returns:
            Number of rows updated
        """
        count = 0
        for item in updates:
            key = item.get("key")
            value = item.get("value")
            if key and value is not None:
                config = await self.update(key, value)
                if config:
                    count += 1
        return count
