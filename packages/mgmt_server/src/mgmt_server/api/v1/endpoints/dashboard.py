"""Dashboard endpoints."""

from fastapi import APIRouter

from mgmt_server.api.deps import CurrentUserDep, DashboardServiceDep
from mgmt_server.api.v1.schemas.repos import DashboardStatsResponse

router = APIRouter()


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    current_user: CurrentUserDep,
    service: DashboardServiceDep,
) -> DashboardStatsResponse:
    """Get dashboard statistics.

    Returns aggregated statistics for the dashboard:
    - total_repos: Total number of HuggingFace repositories (excluding inactive)
    - total_files: Total number of files in S3 bucket
    - storage_capacity: Total storage size in bytes
    - total_downloads: Total download count across all repositories

    Uses a stale-while-revalidate cache strategy to avoid timeouts when
    the cache expires and multiple concurrent requests arrive.
    """
    stats = await service.get_stats()
    return DashboardStatsResponse(data=stats)
