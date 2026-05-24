import pytest

from services.config import ConfigUpdateItem
from services.config.service import ConfigService


@pytest.mark.asyncio
async def test_batch_update_rejects_invalid_builtin_int(db_session):
    service = ConfigService(db_session)

    with pytest.raises(ValueError, match="smtp_port must be an integer"):
        await service.batch_update(
            [ConfigUpdateItem(key="smtp_port", value="not-a-port", category="email")]
        )


@pytest.mark.asyncio
async def test_batch_update_keeps_sensitive_password_when_empty(db_session):
    service = ConfigService(db_session)
    await service.set("smtp_password", "old-secret", category="email", is_sensitive=True)

    await service.batch_update(
        [ConfigUpdateItem(key="smtp_password", value="", category="email", is_sensitive=True)]
    )

    assert await service.get("smtp_password") == "old-secret"


@pytest.mark.asyncio
async def test_batch_update_preserves_custom_config_keys(db_session):
    service = ConfigService(db_session)

    await service.batch_update(
        [ConfigUpdateItem(key="custom_banner", value="hello", category="general")]
    )

    assert await service.get("custom_banner") == "hello"
