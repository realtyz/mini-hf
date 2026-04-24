"""API dependencies."""

from typing import Annotated

from fastapi import Depends

from cache import cache_service
from cache.services.cache import CacheService
from database import AsyncSession, get_db
from services import TaskNotificationService, VerifyCodeService
from services import task_notification_service, verify_code_service
from services.config import ConfigService
from services.task import TaskService
from mgmt_server.core.security import (
    verify_bearer_token,
    verify_refresh_token,
    TokenPayload,
)
from mgmt_server.services.dashboard_service import DashboardService
from mgmt_server.services.task_preview_service import TaskPreviewService
from mgmt_server.services.repo_service import RepoService
from mgmt_server.services.task_lifecycle_service import TaskLifecycleService
from mgmt_server.services.user_service import UserService


# ------------------------------------------------------------------
# Leaf dependencies (singletons / factories)
# ------------------------------------------------------------------


async def get_cache_service() -> CacheService:
    """Get the shared cache service singleton."""
    return cache_service


async def get_task_notification_service() -> TaskNotificationService:
    """Get the shared notification service singleton."""
    return task_notification_service


# ------------------------------------------------------------------
# Service factories
# ------------------------------------------------------------------


async def get_user_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserService:
    """Get user service dependency."""
    return UserService(db)


async def get_task_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskService:
    """Get core task service dependency."""
    return TaskService(db)


async def get_config_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConfigService:
    """Get config service dependency."""
    return ConfigService(db)


async def get_dashboard_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    cache: Annotated[CacheService, Depends(get_cache_service)],
) -> DashboardService:
    """Get dashboard service dependency."""
    return DashboardService(db, cache=cache)


async def get_repo_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    task_service: Annotated[TaskService, Depends(get_task_service)],
) -> RepoService:
    """Get repository service dependency."""
    return RepoService(db, task_service=task_service)


async def get_task_lifecycle_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    task_service: Annotated[TaskService, Depends(get_task_service)],
    user_service: Annotated[UserService, Depends(get_user_service)],
    config_service: Annotated[ConfigService, Depends(get_config_service)],
    cache_service: Annotated[CacheService, Depends(get_cache_service)],
) -> TaskLifecycleService:
    """Get task lifecycle service dependency."""
    return TaskLifecycleService(
        db,
        task_service=task_service,
        user_service=user_service,
        config_service=config_service,
        cache_service=cache_service,
    )


async def get_preview_task_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    task_service: Annotated[TaskService, Depends(get_task_service)],
    cache: Annotated[CacheService, Depends(get_cache_service)],
    config_service: Annotated[ConfigService, Depends(get_config_service)],
    user_service: Annotated[UserService, Depends(get_user_service)],
    lifecycle_service: Annotated[
        TaskLifecycleService, Depends(get_task_lifecycle_service)
    ],
) -> TaskPreviewService:
    """Get preview task service dependency."""
    return TaskPreviewService(
        session=db,
        task_service=task_service,
        cache=cache,
        config_service=config_service,
        user_service=user_service,
        lifecycle_service=lifecycle_service,
    )


def get_verify_code_service():
    """Get verify code service dependency.

    Returns the centralized verify_code_service from emailer package.
    """
    return verify_code_service


# ------------------------------------------------------------------
# Dependency aliases for cleaner imports
# ------------------------------------------------------------------

DbDep = Annotated[AsyncSession, Depends(get_db)]
CacheServiceDep = Annotated[CacheService, Depends(get_cache_service)]
DashboardServiceDep = Annotated[DashboardService, Depends(get_dashboard_service)]
RepoServiceDep = Annotated[RepoService, Depends(get_repo_service)]
TaskServiceDep = Annotated[TaskService, Depends(get_task_service)]
TaskLifecycleServiceDep = Annotated[
    TaskLifecycleService, Depends(get_task_lifecycle_service)
]
PreviewTaskServiceDep = Annotated[TaskPreviewService, Depends(get_preview_task_service)]
UserServiceDep = Annotated[UserService, Depends(get_user_service)]
ConfigServiceDep = Annotated[ConfigService, Depends(get_config_service)]
VerifyCodeServiceDep = Annotated[VerifyCodeService, Depends(get_verify_code_service)]
CurrentUserToken = Annotated[TokenPayload, Depends(verify_bearer_token)]
RefreshUser = Annotated[TokenPayload, Depends(verify_refresh_token)]
