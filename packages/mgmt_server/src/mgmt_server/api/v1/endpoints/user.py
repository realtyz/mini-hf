"""User management endpoints."""

from typing import Annotated

from loguru import logger
from fastapi import APIRouter, Query, status

from mgmt_server.api.deps import AdminUserDep, CurrentUserDep, UserServiceDep
from mgmt_server.core.exceptions import ValidationError
from mgmt_server.core.constants import UserRole
from mgmt_server.api.v1.schemas.users import (
    AdminPasswordResetRequest,
    PasswordResetResponse,
    UserCreateRequest,
    UserCreateResponse,
    UserDetailResponse,
    UserListResponse,
    UserPasswordUpdateRequest,
    UserResponse,
    UserSelfUpdateRequest,
    UserUpdateRequest,
    UserUpdateResponse,
)

router = APIRouter()


@router.get("/me", response_model=UserDetailResponse)
async def get_me(
    current_user: CurrentUserDep,
) -> UserDetailResponse:
    """Get current logged-in user information."""
    return UserDetailResponse(data=UserResponse.model_validate(current_user))


@router.put("/me", response_model=UserUpdateResponse)
async def update_me(
    request: UserSelfUpdateRequest,
    current_user: CurrentUserDep,
    user_service: UserServiceDep,
) -> UserUpdateResponse:
    """Update current user information (self-service)."""
    updated_user = await user_service.update_user(
        user_id=current_user.id,
        name=request.name,
    )
    return UserUpdateResponse(data=UserResponse.model_validate(updated_user))


@router.put("/me/password", response_model=PasswordResetResponse)
async def update_my_password(
    request: UserPasswordUpdateRequest,
    current_user: CurrentUserDep,
    user_service: UserServiceDep,
) -> PasswordResetResponse:
    """Update own password (self-service)."""
    await user_service.change_password(
        user_id=current_user.id,
        current_password=request.current_password,
        new_password=request.new_password,
    )
    return PasswordResetResponse()


# Admin endpoints


@router.get("/list", response_model=UserListResponse)
async def list_users(
    admin_user: AdminUserDep,
    user_service: UserServiceDep,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    email_search: Annotated[
        str | None, Query(description="Fuzzy search by email substring")
    ] = None,
) -> UserListResponse:
    """List all users (admin only)."""
    users, total = await user_service.list_users(
        skip=skip, limit=limit, email_search=email_search
    )
    return UserListResponse(
        data=[UserResponse.model_validate(user) for user in users],
        total=total,
    )


@router.post("", response_model=UserCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    request: UserCreateRequest,
    admin_user: AdminUserDep,
    user_service: UserServiceDep,
) -> UserCreateResponse:
    """Create a new user (admin only)."""
    user = await user_service.create_user(
        name=request.name,
        email=request.email,
        password=request.password,
        role=request.role,
        is_active=request.is_active,
    )
    return UserCreateResponse(data=UserResponse.model_validate(user))


@router.get("/{user_id}", response_model=UserDetailResponse)
async def get_user(
    user_id: int,
    admin_user: AdminUserDep,
    user_service: UserServiceDep,
) -> UserDetailResponse:
    """Get user by ID (admin only)."""
    user = await user_service.get_or_raise(user_id)
    return UserDetailResponse(data=UserResponse.model_validate(user))


@router.put("/{user_id}", response_model=UserUpdateResponse)
async def update_user(
    user_id: int,
    request: UserUpdateRequest,
    admin_user: AdminUserDep,
    user_service: UserServiceDep,
) -> UserUpdateResponse:
    """Update user information (admin only)."""
    # Prevent admin from demoting themselves
    if (
        user_id == admin_user.id
        and request.role is not None
        and request.role != UserRole.ADMIN
    ):
        raise ValidationError("Cannot change your own admin role")

    updated_user = await user_service.update_user(
        user_id=user_id,
        name=request.name,
        email=request.email,
        role=request.role,
        is_active=request.is_active,
    )
    return UserUpdateResponse(data=UserResponse.model_validate(updated_user))


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    admin_user: AdminUserDep,
    user_service: UserServiceDep,
) -> None:
    """Delete (deactivate) a user (admin only).

    Prevents deactivating the last active admin to ensure at least
    one admin always remains in the system.
    """
    if user_id == admin_user.id:
        raise ValidationError("Cannot delete yourself")

    await user_service.deactivate_user_with_admin_check(user_id)


@router.post("/{user_id}/reset-password", response_model=PasswordResetResponse)
async def admin_reset_password(
    user_id: int,
    request: AdminPasswordResetRequest,
    admin_user: AdminUserDep,
    user_service: UserServiceDep,
) -> PasswordResetResponse:
    """Reset user password (admin only)."""
    await user_service.admin_reset_password(user_id, request.new_password)
    logger.info("Admin {} reset password for user {}", admin_user.email, user_id)
    return PasswordResetResponse()
