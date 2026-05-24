"""System endpoints: announcements, health, etc."""

from fastapi import APIRouter, HTTPException
from sqlalchemy import select, desc

from database.db_models.announcement import Announcement
from mgmt_server.api.deps import DbDep
from mgmt_server.api.v1.endpoints.user import AdminUserDep
from mgmt_server.api.v1.schemas.base import BaseResponse
from mgmt_server.api.v1.schemas.configs import (
    AnnouncementCreateRequest,
    AnnouncementUpdateRequest,
    AnnouncementResponse,
)

router = APIRouter()


# ------------------------------------------------------------------
# Public endpoints (no auth)
# ------------------------------------------------------------------


@router.get(
    "/announcements",
    response_model=BaseResponse[list[AnnouncementResponse]],
)
async def list_public_announcements(
    db: DbDep,
) -> BaseResponse[list[AnnouncementResponse]]:
    """List active announcements. Pinned first, then newest first. No auth required."""
    result = await db.execute(
        select(Announcement)
        .where(Announcement.is_active == True)
        .order_by(desc(Announcement.is_pinned), desc(Announcement.created_at))
    )
    announcements = result.scalars().all()
    return BaseResponse[list[AnnouncementResponse]](
        data=[AnnouncementResponse.from_model(a) for a in announcements]
    )


@router.get(
    "/announcements/admin",
    response_model=BaseResponse[list[AnnouncementResponse]],
)
async def list_all_announcements(
    admin: AdminUserDep,
    db: DbDep,
) -> BaseResponse[list[AnnouncementResponse]]:
    """List all announcements including inactive ones. Admin only."""
    result = await db.execute(
        select(Announcement)
        .order_by(desc(Announcement.is_pinned), desc(Announcement.created_at))
    )
    announcements = result.scalars().all()
    return BaseResponse[list[AnnouncementResponse]](
        data=[AnnouncementResponse.from_model(a) for a in announcements]
    )


@router.get(
    "/announcements/{announcement_id}",
    response_model=BaseResponse[AnnouncementResponse],
)
async def get_public_announcement(
    announcement_id: int,
    db: DbDep,
) -> BaseResponse[AnnouncementResponse]:
    """Get a single active announcement by ID. No auth required."""
    announcement = await db.get(Announcement, announcement_id)
    if not announcement or not announcement.is_active:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return BaseResponse[AnnouncementResponse](
        data=AnnouncementResponse.from_model(announcement)
    )


# ------------------------------------------------------------------
# Admin endpoints (require auth)
# ------------------------------------------------------------------


@router.post(
    "/announcements",
    response_model=BaseResponse[AnnouncementResponse],
    status_code=201,
)
async def create_announcement(
    admin: AdminUserDep,
    db: DbDep,
    request: AnnouncementCreateRequest,
) -> BaseResponse[AnnouncementResponse]:
    """Create a new announcement. Admin only."""
    announcement = Announcement(
        title=request.title,
        content=request.content,
        announcement_type=request.announcement_type,
        is_pinned=request.is_pinned,
        is_active=request.is_active,
    )
    db.add(announcement)
    await db.flush()
    await db.refresh(announcement)
    return BaseResponse[AnnouncementResponse](
        data=AnnouncementResponse.from_model(announcement)
    )


@router.put(
    "/announcements/{announcement_id}",
    response_model=BaseResponse[AnnouncementResponse],
)
async def update_announcement(
    announcement_id: int,
    admin: AdminUserDep,
    db: DbDep,
    request: AnnouncementUpdateRequest,
) -> BaseResponse[AnnouncementResponse]:
    """Update an announcement. Admin only."""
    announcement = await db.get(Announcement, announcement_id)
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")

    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(announcement, key, value)

    await db.flush()
    await db.refresh(announcement)
    return BaseResponse[AnnouncementResponse](
        data=AnnouncementResponse.from_model(announcement)
    )


@router.delete(
    "/announcements/{announcement_id}",
    response_model=BaseResponse,
)
async def delete_announcement(
    announcement_id: int,
    admin: AdminUserDep,
    db: DbDep,
) -> BaseResponse:
    """Delete an announcement. Admin only."""
    announcement = await db.get(Announcement, announcement_id)
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    await db.delete(announcement)
    await db.flush()
    return BaseResponse(message="Announcement deleted")
