"""User management endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from mgmt_server.api.deps import CurrentUserToken, UserServiceDep
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
from database.db_models import User

router = APIRouter()


async def get_current_user(
    current_user_token: CurrentUserToken,
    user_service: UserServiceDep,
) -> User:
    """Get current authenticated user entity.

    Args:
        current_user_token: Current user token payload from JWT token
        user_service: User service dependency

    Returns:
        Current user entity

    Raises:
        HTTPException: If user not found or inactive
    """
    user = await user_service.get_by_email(current_user_token.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive",
        )
    return user


async def require_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Require admin role for access.

    Args:
        current_user: Current authenticated user

    Returns:
        Current user if admin

    Raises:
        HTTPException: If user is not admin
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


# Dependencies
CurrentUserDep = Annotated[User, Depends(get_current_user)]
AdminUserDep = Annotated[User, Depends(require_admin)]


@router.get("/me", response_model=UserDetailResponse)
async def get_me(
    current_user: CurrentUserDep,
) -> UserDetailResponse:
    """Get current logged-in user information.

    Args:
        current_user: Current authenticated user

    Returns:
        Current user information
    """
    return UserDetailResponse(
        data=UserResponse.model_validate(current_user)
    )


@router.put("/me", response_model=UserUpdateResponse)
async def update_me(
    request: UserSelfUpdateRequest,
    current_user: CurrentUserDep,
    user_service: UserServiceDep,
) -> UserUpdateResponse:
    """Update current user information (self-service).

    Args:
        request: Update request (name only for self-service)
        current_user: Current authenticated user
        user_service: User service dependency

    Returns:
        Updated user information
    """
    updated_user = await user_service.update_user(
        user_id=current_user.id,
        name=request.name,
    )
    return UserUpdateResponse(
        data=UserResponse.model_validate(updated_user)
    )


@router.put("/me/password", response_model=PasswordResetResponse)
async def update_my_password(
    request: UserPasswordUpdateRequest,
    current_user: CurrentUserDep,
    user_service: UserServiceDep,
) -> PasswordResetResponse:
    """Update own password (self-service).

    Args:
        request: Password update request with current and new password
        current_user: Current authenticated user
        user_service: User service dependency

    Returns:
        Password reset success response

    Raises:
        HTTPException: If current password is incorrect
    """
    try:
        await user_service.change_password(
            user_id=current_user.id,
            current_password=request.current_password,
            new_password=request.new_password,
        )
        return PasswordResetResponse()
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# Admin endpoints


@router.get("", response_model=UserListResponse)
async def list_users(
    admin_user: AdminUserDep,
    user_service: UserServiceDep,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> UserListResponse:
    """List all users (admin only).

    Args:
        admin_user: Current admin user (dependency enforces admin role)
        user_service: User service dependency
        skip: Number of users to skip (pagination)
        limit: Number of users to return (pagination)

    Returns:
        List of users with total count
    """
    users, total = await user_service.list_users(skip=skip, limit=limit)
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
    """Create a new user (admin only).

    Args:
        request: User creation request with name, email, password, role, is_active
        admin_user: Current admin user
        user_service: User service dependency

    Returns:
        Created user information

    Raises:
        HTTPException: If email already exists
    """
    try:
        user = await user_service.create_user(
            name=request.name,
            email=request.email,
            password=request.password,
            role=request.role,
        )
        # Set is_active if explicitly provided
        if request.is_active is not None and request.is_active != user.is_active:
            user = await user_service.update_user(
                user_id=user.id,
                is_active=request.is_active,
            )
        return UserCreateResponse(
            data=UserResponse.model_validate(user)
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )


@router.get("/{user_id}", response_model=UserDetailResponse)
async def get_user(
    user_id: int,
    admin_user: AdminUserDep,
    user_service: UserServiceDep,
) -> UserDetailResponse:
    """Get user by ID (admin only).

    Args:
        user_id: User ID
        admin_user: Current admin user
        user_service: User service dependency

    Returns:
        User information

    Raises:
        HTTPException: If user not found
    """
    user = await user_service.get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )
    return UserDetailResponse(
        data=UserResponse.model_validate(user)
    )


@router.put("/{user_id}", response_model=UserUpdateResponse)
async def update_user(
    user_id: int,
    request: UserUpdateRequest,
    admin_user: AdminUserDep,
    user_service: UserServiceDep,
) -> UserUpdateResponse:
    """Update user information (admin only).

    Args:
        user_id: User ID to update
        request: Update request with name, email, role, is_active
        admin_user: Current admin user
        user_service: User service dependency

    Returns:
        Updated user information

    Raises:
        HTTPException: If user not found
    """
    user = await user_service.get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )

    # Prevent admin from demoting themselves if they're the only admin
    if (
        user_id == admin_user.id
        and request.role is not None
        and request.role != "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own admin role",
        )

    updated_user = await user_service.update_user(
        user_id=user_id,
        name=request.name,
        email=request.email,
        role=request.role,
        is_active=request.is_active,
    )
    return UserUpdateResponse(
        data=UserResponse.model_validate(updated_user)
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    admin_user: AdminUserDep,
    user_service: UserServiceDep,
) -> None:
    """Delete (deactivate) a user (admin only).

    Args:
        user_id: User ID to delete
        admin_user: Current admin user
        user_service: User service dependency

    Raises:
        HTTPException: If user not found or trying to delete self
    """
    if user_id == admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete yourself",
        )

    user = await user_service.get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )

    await user_service.deactivate_user(user_id)


@router.post("/{user_id}/reset-password", response_model=PasswordResetResponse)
async def admin_reset_password(
    user_id: int,
    request: AdminPasswordResetRequest,
    admin_user: AdminUserDep,
    user_service: UserServiceDep,
) -> PasswordResetResponse:
    """Reset user password (admin only).

    Args:
        user_id: User ID to reset password for
        request: Password reset request with new password
        admin_user: Current admin user
        user_service: User service dependency

    Returns:
        Password reset success response

    Raises:
        HTTPException: If user not found
    """
    user = await user_service.get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )

    await user_service.admin_reset_password(user_id, request.new_password)
    return PasswordResetResponse()
