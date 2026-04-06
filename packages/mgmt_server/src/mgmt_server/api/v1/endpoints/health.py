"""Health check and public endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends

from mgmt_server.api.deps import DbDep
from mgmt_server.api.v1.schemas.configs import (
    AnnouncementConfigResponse,
    AnnouncementConfigResponseWrapper,
    HFEndpointConfigResponse,
    HFEndpointConfigResponseWrapper,
)
from services.config import ConfigService

router = APIRouter()


@router.get("/")
async def health_check() -> dict:
    """Health check endpoint - no auth required."""
    return {"status": "healthy"}


async def get_config_service(db: DbDep) -> ConfigService:
    """Get ConfigService dependency."""
    return ConfigService(db)


ConfigServiceDep = Annotated[ConfigService, Depends(get_config_service)]


@router.get("/announcement", response_model=AnnouncementConfigResponseWrapper)
async def get_public_announcement(
    config_service: ConfigServiceDep,
) -> AnnouncementConfigResponseWrapper:
    """Get public announcement - no auth required.

    Returns active announcement content and type for display on landing page.
    """
    config = await config_service.get_announcement_config()
    return AnnouncementConfigResponseWrapper(
        data=AnnouncementConfigResponse(
            content=config["content"],
            announcement_type=config["announcement_type"],
            is_active=config["is_active"],
        )
    )


@router.get("/hf-endpoints", response_model=HFEndpointConfigResponseWrapper)
async def get_public_hf_endpoints(
    config_service: ConfigServiceDep,
) -> HFEndpointConfigResponseWrapper:
    """Get HuggingFace endpoints - no auth required.

    Returns available HF endpoints for task creation dialog.
    """
    endpoints = await config_service.get_hf_endpoints()
    default_endpoint = await config_service.get_hf_default_endpoint()
    return HFEndpointConfigResponseWrapper(
        data=HFEndpointConfigResponse(
            endpoints=endpoints,
            default_endpoint=default_endpoint,
        )
    )
