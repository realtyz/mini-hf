"""Health check and public endpoints."""

from fastapi import APIRouter
from sqlalchemy import select, desc

from database.db_models.announcement import Announcement
from mgmt_server.api.deps import ConfigServiceDep, DbDep
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
    db: DbDep,
) -> BaseResponse[AnnouncementConfigResponse]:
    """[DEPRECATED] Use GET /system/announcements instead.

    Returns the most recent active announcement for backward compatibility.
    """
    result = await db.execute(
        select(Announcement)
        .where(Announcement.is_active == True)
        .order_by(desc(Announcement.created_at))
        .limit(1)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        return BaseResponse[AnnouncementConfigResponse](data=None)
    return BaseResponse[AnnouncementConfigResponse](
        data=AnnouncementConfigResponse(
            content=announcement.content,
            announcement_type=announcement.announcement_type
            if isinstance(announcement.announcement_type, str)
            else announcement.announcement_type.value,
            is_active=announcement.is_active,
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
