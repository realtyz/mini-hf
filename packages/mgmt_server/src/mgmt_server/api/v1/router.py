"""API v1 router aggregation."""

from fastapi import APIRouter

from mgmt_server.api.v1.endpoints import (
    auth,
    batch,
    cache_scan,
    config,
    dashboard,
    health,
    repair,
    repo,
    system,
    task,
    trending,
    user,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(batch.router, prefix="/batch", tags=["Batch Operations"])
api_router.include_router(config.router, prefix="/config", tags=["Config Management"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
api_router.include_router(health.router, prefix="/health", tags=["Health"])
api_router.include_router(repair.router, prefix="/admin/repair", tags=["Admin Repair"])
api_router.include_router(repo.router, prefix="/hf_repo", tags=["Repo Management"])
api_router.include_router(system.router, prefix="/system", tags=["System"])
api_router.include_router(task.router, prefix="/task", tags=["Task Management"])
api_router.include_router(cache_scan.router, prefix="/cache/scan", tags=["Cache Scan"])
api_router.include_router(trending.router, prefix="/trending", tags=["Trending"])
api_router.include_router(user.router, prefix="/user", tags=["User Management"])
