"""Tests for ModelScope ConfigService accessors and schema passthrough.

V3: ConfigService MS endpoint typed accessors + batch validation.
V4: ConfigSchemaBuilder exposes the ModelScope category/keys.

These tests use the ``db_session`` fixture (live PostgreSQL) inherited from
``conftest.py``, mirroring ``test_config_service_hf_validation.py``.
"""

import json

import pytest

from services.config import ConfigUpdateItem
from services.config.schema_builder import ConfigSchemaBuilder
from services.config.service import ConfigService, MSEndpointConfig


@pytest.mark.asyncio
async def test_get_ms_endpoints_default(db_session):
    # Seed a known state so the test is independent of DB init ordering.
    service = ConfigService(db_session)
    await service.save_ms_endpoint_config(
        MSEndpointConfig(
            endpoints=["https://modelscope.cn"],
            default_endpoint="https://modelscope.cn",
        )
    )
    ConfigService.invalidate()
    endpoints = await service.get_ms_endpoints()
    assert "https://modelscope.cn" in endpoints


@pytest.mark.asyncio
async def test_get_ms_default_endpoint(db_session):
    service = ConfigService(db_session)
    default = await service.get_ms_default_endpoint()
    assert default == "https://modelscope.cn"


@pytest.mark.asyncio
async def test_save_and_read(db_session):
    service = ConfigService(db_session)
    await service.save_ms_endpoint_config(
        MSEndpointConfig(
            endpoints=["https://modelscope.cn", "https://ms-mirror.example.com"],
            default_endpoint="https://ms-mirror.example.com",
        )
    )
    ConfigService.invalidate()
    assert await service.get_ms_default_endpoint() == "https://ms-mirror.example.com"


@pytest.mark.asyncio
async def test_empty_endpoints_rejected(db_session):
    service = ConfigService(db_session)
    with pytest.raises(ValueError, match="cannot be empty"):
        await service.save_ms_endpoint_config(
            MSEndpointConfig(endpoints=[], default_endpoint="https://modelscope.cn")
        )


@pytest.mark.asyncio
async def test_default_not_in_list_rejected(db_session):
    service = ConfigService(db_session)
    with pytest.raises(ValueError, match="must be in the endpoints list"):
        await service.save_ms_endpoint_config(
            MSEndpointConfig(
                endpoints=["https://modelscope.cn"],
                default_endpoint="https://other.example.com",
            )
        )


@pytest.mark.asyncio
async def test_batch_update_validates_ms_consistency(db_session):
    """batch_update path must reject MS default not in endpoints list."""
    service = ConfigService(db_session)
    with pytest.raises(ValueError, match="must be in the endpoints list"):
        await service.batch_update(
            [
                ConfigUpdateItem(
                    key="ms_endpoints",
                    value=json.dumps(["https://modelscope.cn"]),
                    category="modelscope",
                ),
                ConfigUpdateItem(
                    key="ms_default_endpoint",
                    value="https://invalid.example.com",
                    category="modelscope",
                ),
            ]
        )


@pytest.mark.asyncio
async def test_batch_update_accepts_valid_ms_endpoint_pair(db_session):
    """batch_update accepts a consistent MS endpoint pair and persists it."""
    service = ConfigService(db_session)
    await service.batch_update(
        [
            ConfigUpdateItem(
                key="ms_endpoints",
                value=json.dumps(["https://modelscope.cn"]),
                category="modelscope",
            ),
            ConfigUpdateItem(
                key="ms_default_endpoint",
                value="https://modelscope.cn",
                category="modelscope",
            ),
        ]
    )
    ConfigService.invalidate()
    assert await service.get_ms_default_endpoint() == "https://modelscope.cn"


# ── V4: ConfigSchemaBuilder passthrough ────────────────────────────────────────


@pytest.mark.asyncio
async def test_ms_category_in_schema(db_session):
    service = ConfigService(db_session)
    builder = ConfigSchemaBuilder(service._provider)
    schema = await builder.build()
    categories = [c.id for c in schema.categories]
    assert "modelscope" in categories


@pytest.mark.asyncio
async def test_ms_keys_in_schema(db_session):
    service = ConfigService(db_session)
    builder = ConfigSchemaBuilder(service._provider)
    schema = await builder.build()
    ms_cat = next(c for c in schema.categories if c.id == "modelscope")
    keys = [f.key for f in ms_cat.fields]
    assert "ms_endpoints" in keys
    assert "ms_default_endpoint" in keys

