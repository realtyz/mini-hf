"""API dependencies."""

from typing import Annotated

from fastapi import Depends

from cache import cache_service
from cache.services.cache import CacheService
from database import AsyncSession, unit_of_work
from database.db_models import User
from services import TaskNotificationService, VerifyCodeService
from services.config import ConfigService
from services.task import TaskService
from mgmt_server.core.constants import UserRole
from mgmt_server.core.exceptions import PermissionDeniedError, UnauthorizedError
from mgmt_server.core.security import (
    verify_bearer_token,
    verify_refresh_token,
    TokenPayload,
)
from mgmt_server.services.config_management_service import ConfigManagementService
from mgmt_server.services.dashboard_service import DashboardService
from mgmt_server.services.task_preview_service import TaskPreviewService
from mgmt_server.services.cache_scan_service import CacheScanService
from mgmt_server.services.repo_service import RepoService
from mgmt_server.services.task_lifecycle_service import TaskLifecycleService
from mgmt_server.services.token_service import TokenService
from mgmt_server.services.user_service import UserService


# ------------------------------------------------------------------
# Leaf dependencies (singletons / factories)
# ------------------------------------------------------------------


async def get_cache_service() -> CacheService:
    """Get the shared cache service singleton."""
    return cache_service


# ------------------------------------------------------------------
# Service factories
# ------------------------------------------------------------------


async def get_user_service(
    db: Annotated[AsyncSession, Depends(unit_of_work)],
) -> UserService:
    """Get user service dependency."""
    return UserService(db)


async def get_task_service(
    db: Annotated[AsyncSession, Depends(unit_of_work)],
) -> TaskService:
    """Get core task service dependency."""
    return TaskService(db)


async def get_config_service(
    db: Annotated[AsyncSession, Depends(unit_of_work)],
) -> ConfigService:
    """Get config service dependency."""
    return ConfigService(db)


async def get_task_notification_service(
    db: Annotated[AsyncSession, Depends(unit_of_work)],
    config_service: Annotated[ConfigService, Depends(get_config_service)],
) -> TaskNotificationService:
    """Get task notification service dependency."""
    return TaskNotificationService(config_service=config_service, session=db)


async def get_config_management_service(
    config_service: Annotated[ConfigService, Depends(get_config_service)],
) -> ConfigManagementService:
    """Get config management service dependency."""
    return ConfigManagementService(config_service)


async def get_dashboard_service(
    db: Annotated[AsyncSession, Depends(unit_of_work)],
    cache: Annotated[CacheService, Depends(get_cache_service)],
) -> DashboardService:
    """Get dashboard service dependency."""
    return DashboardService(db, cache=cache)


async def get_repo_service(
    db: Annotated[AsyncSession, Depends(unit_of_work)],
    task_service: Annotated[TaskService, Depends(get_task_service)],
) -> RepoService:
    """Get repository service dependency."""
    return RepoService(db, task_service=task_service)


async def get_task_lifecycle_service(
    db: Annotated[AsyncSession, Depends(unit_of_work)],
    task_service: Annotated[TaskService, Depends(get_task_service)],
    user_service: Annotated[UserService, Depends(get_user_service)],
    config_service: Annotated[ConfigService, Depends(get_config_service)],
    cache_service: Annotated[CacheService, Depends(get_cache_service)],
    notification_service: Annotated[
        TaskNotificationService, Depends(get_task_notification_service)
    ],
) -> TaskLifecycleService:
    """Get task lifecycle service dependency."""
    return TaskLifecycleService(
        db,
        task_service=task_service,
        user_service=user_service,
        config_service=config_service,
        cache_service=cache_service,
        notification_service=notification_service,
    )


async def get_task_preview_service(
    db: Annotated[AsyncSession, Depends(unit_of_work)],
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


async def get_cache_scan_service(
    db: Annotated[AsyncSession, Depends(unit_of_work)],
    cache: Annotated[CacheService, Depends(get_cache_service)],
) -> CacheScanService:
    """Get cache scan service dependency."""
    return CacheScanService(db, cache=cache)


async def get_verify_code_service(
    config_service: Annotated[ConfigService, Depends(get_config_service)],
) -> VerifyCodeService:
    """Get verify code service dependency."""
    return VerifyCodeService(config_service=config_service)


async def get_token_service(
    cache: Annotated[CacheService, Depends(get_cache_service)],
) -> TokenService:
    """Get token service dependency."""
    return TokenService(cache=cache)


# ------------------------------------------------------------------
# Dependency aliases for cleaner imports
# ------------------------------------------------------------------

DbDep = Annotated[AsyncSession, Depends(unit_of_work)]
CacheServiceDep = Annotated[CacheService, Depends(get_cache_service)]
DashboardServiceDep = Annotated[DashboardService, Depends(get_dashboard_service)]
RepoServiceDep = Annotated[RepoService, Depends(get_repo_service)]
TaskServiceDep = Annotated[TaskService, Depends(get_task_service)]
TaskLifecycleServiceDep = Annotated[
    TaskLifecycleService, Depends(get_task_lifecycle_service)
]
TaskPreviewServiceDep = Annotated[TaskPreviewService, Depends(get_task_preview_service)]
UserServiceDep = Annotated[UserService, Depends(get_user_service)]
ConfigServiceDep = Annotated[ConfigService, Depends(get_config_service)]
CacheScanServiceDep = Annotated[CacheScanService, Depends(get_cache_scan_service)]
ConfigManagementServiceDep = Annotated[
    ConfigManagementService, Depends(get_config_management_service)
]
VerifyCodeServiceDep = Annotated[VerifyCodeService, Depends(get_verify_code_service)]
TaskNotificationServiceDep = Annotated[
    TaskNotificationService, Depends(get_task_notification_service)
]
TokenServiceDep = Annotated[TokenService, Depends(get_token_service)]
CurrentUserToken = Annotated[TokenPayload, Depends(verify_bearer_token)]
RefreshUser = Annotated[TokenPayload, Depends(verify_refresh_token)]


# ------------------------------------------------------------------
# Auth dependencies (user entity + role checks)
# ------------------------------------------------------------------


async def get_current_user(
    current_user_token: CurrentUserToken,
    user_service: UserServiceDep,
) -> User:
    """Get current authenticated user entity."""
    user = await user_service.get_by_email(current_user_token.email)
    if not user:
        raise UnauthorizedError("User not found")
    if not user.is_active:
        raise PermissionDeniedError("User is inactive")
    return user


async def require_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Require admin role for access."""
    if current_user.role != UserRole.ADMIN:
        raise PermissionDeniedError("Admin access required")
    return current_user


async def get_refresh_user(
    refresh_user: RefreshUser,
    user_service: UserServiceDep,
) -> User:
    """Get user entity from refresh token, with active check."""
    user = await user_service.get_by_email(refresh_user.email)
    if not user:
        raise UnauthorizedError("User not found")
    if not user.is_active:
        raise PermissionDeniedError("User is inactive")
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]
RefreshUserDep = Annotated[User, Depends(get_refresh_user)]
AdminUserDep = Annotated[User, Depends(require_admin)]
