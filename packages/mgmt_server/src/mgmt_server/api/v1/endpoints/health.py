"""Health check and public endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select, desc

from database.db_models.announcement import Announcement
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
    db: DbDep,
) -> AnnouncementConfigResponseWrapper:
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
        return AnnouncementConfigResponseWrapper(data=None)
    return AnnouncementConfigResponseWrapper(
        data=AnnouncementConfigResponse(
            content=announcement.content,
            announcement_type=announcement.announcement_type
            if isinstance(announcement.announcement_type, str)
            else announcement.announcement_type.value,
            is_active=announcement.is_active,
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
