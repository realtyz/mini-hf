import json

import pytest

from services.config import ConfigUpdateItem
from services.config.service import ConfigService


@pytest.mark.asyncio
async def test_batch_update_rejects_default_endpoint_not_in_endpoint_list(db_session):
    service = ConfigService(db_session)

    with pytest.raises(ValueError, match="Default endpoint must be in the endpoints list"):
        await service.batch_update(
            [
                ConfigUpdateItem(
                    key="hf_endpoints",
                    value=json.dumps(["https://huggingface.co"]),
                    category="huggingface",
                ),
                ConfigUpdateItem(
                    key="hf_default_endpoint",
                    value="https://invalid.example.com",
                    category="huggingface",
                ),
            ]
        )


@pytest.mark.asyncio
async def test_batch_update_accepts_valid_hf_endpoint_pair(db_session):
    service = ConfigService(db_session)

    await service.batch_update(
        [
            ConfigUpdateItem(
                key="hf_endpoints",
                value=json.dumps(["https://huggingface.co"]),
                category="huggingface",
            ),
            ConfigUpdateItem(
                key="hf_default_endpoint",
                value="https://huggingface.co",
                category="huggingface",
            ),
        ]
    )

    assert await service.get_hf_default_endpoint() == "https://huggingface.co"
