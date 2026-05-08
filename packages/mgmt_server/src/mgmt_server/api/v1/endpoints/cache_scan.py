"""Cache scan endpoints for detecting unused repositories."""

from fastapi import APIRouter, Query

from mgmt_server.api.deps import AdminUserDep, CacheScanServiceDep, CurrentUserDep
from mgmt_server.api.v1.schemas.cache_scan import ScanResultResponse

router = APIRouter()


@router.get("/result", response_model=ScanResultResponse)
async def get_scan_result(
    current_user: CurrentUserDep,
    service: CacheScanServiceDep,
) -> ScanResultResponse:
    """Get the most recent cache scan result.

    Returns cached scan data identifying repositories with no recent download activity.
    Returns null data if no scan has been performed yet.
    """
    result = await service.get_result()
    return ScanResultResponse(data=result)


@router.post("/run", response_model=ScanResultResponse)
async def trigger_scan(
    admin_user: AdminUserDep,
    service: CacheScanServiceDep,
    threshold_days: int = Query(
        default=90,
        ge=1,
        le=365,
        description="Days without downloads to consider a repo as cold",
    ),
) -> ScanResultResponse:
    """Manually trigger a cache scan (admin only).

    Scans all active repositories and flags those with no download activity
    within the specified threshold. Results are cached in Redis for subsequent
    GET /result calls.
    """
    result = await service.scan(threshold_days=threshold_days)
    return ScanResultResponse(data=result)
