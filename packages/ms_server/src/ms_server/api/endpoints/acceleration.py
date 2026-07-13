"""Acceleration probe endpoint.

``modelscope_hub``'s ``DownloadManager`` sends this probe before the first
file download in a session (bare ``requests.get``, 0.2s timeout, no auth).
Returning an empty ``{}`` skips region detection; returning an object with
``Data.InternalRegionQueryAddress`` would trigger a second probe, so the body
must stay empty. See analysis doc §2.1.
"""

from fastapi import APIRouter

router = APIRouter(tags=["Acceleration"])


@router.get("/api/v1/repos/internalAccelerationInfo")
async def internal_acceleration_info() -> dict:
    """Return ``{}`` to skip the region acceleration probe."""
    return {}
