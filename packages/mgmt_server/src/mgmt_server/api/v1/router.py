"""API v1 router aggregation."""

from fastapi import APIRouter

from mgmt_server.api.v1.endpoints import auth, config, health, repo, task, user

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(user.router, prefix="/user", tags=["users"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(repo.router)
api_router.include_router(task.router)
api_router.include_router(config.router, prefix="/config", tags=["config"])
