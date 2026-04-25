"""Health check and public endpoints."""

from fastapi import APIRouter

from mgmt_server.api.deps import ConfigServiceDep
from mgmt_server.api.v1.schemas.base import BaseResponse
from mgmt_server.api.v1.schemas.configs import (
    AnnouncementConfigResponse,
    HFEndpointConfigResponse,
)

router = APIRouter()


@router.get("/", response_model=BaseResponse)
async def health_check() -> BaseResponse:
    """Health check endpoint - no auth required."""
    return BaseResponse(data={"status": "healthy"})


@router.get("/announcement", response_model=BaseResponse[AnnouncementConfigResponse])
async def get_public_announcement(
    config_service: ConfigServiceDep,
) -> BaseResponse[AnnouncementConfigResponse]:
    """Get public announcement - no auth required.

    Returns active announcement content and type for display on landing page.
    """
    config = await config_service.get_announcement_config()
    return BaseResponse[AnnouncementConfigResponse](
        data=AnnouncementConfigResponse(
            content=config.content,
            announcement_type=config.announcement_type,
            is_active=config.is_active,
        )
    )


@router.get("/hf-endpoints", response_model=BaseResponse[HFEndpointConfigResponse])
async def get_public_hf_endpoints(
    config_service: ConfigServiceDep,
) -> BaseResponse[HFEndpointConfigResponse]:
    """Get HuggingFace endpoints - no auth required.

    Returns available HF endpoints for task creation dialog.
    """
    endpoints = await config_service.get_hf_endpoints()
    default_endpoint = await config_service.get_hf_default_endpoint()
    return BaseResponse[HFEndpointConfigResponse](
        data=HFEndpointConfigResponse(
            endpoints=endpoints,
            default_endpoint=default_endpoint,
        )
    )
