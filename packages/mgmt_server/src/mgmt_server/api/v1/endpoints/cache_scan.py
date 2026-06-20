"""Cache scan endpoints for detecting unused repositories."""

from fastapi import APIRouter

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
) -> ScanResultResponse:
    """Manually trigger a cache scan (admin only).

    Scans all S3 objects to identify every cached repository and classifies
    each as tracked (has DB profile) or untracked (S3-only). Results are
    cached in Redis for subsequent GET /result calls.
    """
    result = await service.scan()
    return ScanResultResponse(data=result)
