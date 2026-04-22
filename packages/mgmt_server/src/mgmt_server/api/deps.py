"""API dependencies."""

from typing import Annotated

from fastapi import Depends

from database import get_db, AsyncSession
from services import verify_code_service, VerifyCodeService
from mgmt_server.core.security import verify_bearer_token, verify_refresh_token, TokenPayload
from mgmt_server.services.dashboard_service import DashboardService
from mgmt_server.services.repo_service import RepoService
from mgmt_server.services.task_mgmt_service import TaskMgmtService
from mgmt_server.services.user_service import UserService
from services.config import ConfigService


async def get_dashboard_service() -> DashboardService:
    """Get dashboard service dependency."""
    return DashboardService()


async def get_repo_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RepoService:
    """Get repository service dependency."""
    return RepoService(db)


async def get_task_mgmt_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskMgmtService:
    """Get task management service dependency."""
    return TaskMgmtService(db)


async def get_user_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserService:
    """Get user service dependency."""
    return UserService(db)


async def get_config_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConfigService:
    """Get config service dependency."""
    return ConfigService(db)


def get_verify_code_service() -> VerifyCodeService:
    """Get verify code service dependency.

    Returns the centralized verify_code_service from emailer package.
    """
    return verify_code_service


# Dependency aliases for cleaner imports
DbDep = Annotated[AsyncSession, Depends(get_db)]
DashboardServiceDep = Annotated[DashboardService, Depends(get_dashboard_service)]
RepoServiceDep = Annotated[RepoService, Depends(get_repo_service)]
TaskMgmtServiceDep = Annotated[TaskMgmtService, Depends(get_task_mgmt_service)]
UserServiceDep = Annotated[UserService, Depends(get_user_service)]
ConfigServiceDep = Annotated[ConfigService, Depends(get_config_service)]
VerifyCodeServiceDep = Annotated[VerifyCodeService, Depends(get_verify_code_service)]
CurrentUserToken = Annotated[TokenPayload, Depends(verify_bearer_token)]
RefreshUser = Annotated[TokenPayload, Depends(verify_refresh_token)]
