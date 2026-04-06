"""User schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from mgmt_server.api.v1.schemas.base import BaseResponse


class UserRegisterRequest(BaseModel):
    """User registration request schema (self-registration)."""

    name: str = Field(..., min_length=1, max_length=255, description="User name")
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(
        ..., min_length=6, description="User password (min 6 characters)"
    )


class UserCreateRequest(BaseModel):
    """User creation request schema (admin)."""

    name: str = Field(..., min_length=1, max_length=255, description="User name")
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(
        ..., min_length=6, description="User password (min 6 characters)"
    )
    role: str = Field(default="user", max_length=255, description="User role")
    is_active: bool = Field(default=True, description="Whether user is active")


class UserUpdateRequest(BaseModel):
    """User update request schema."""

    name: str | None = Field(
        None, min_length=1, max_length=255, description="User name"
    )
    email: EmailStr | None = Field(None, description="User email address")
    role: str | None = Field(None, max_length=255, description="User role")
    is_active: bool | None = Field(None, description="Whether user is active")


class UserSelfUpdateRequest(BaseModel):
    """Self user update request schema (users can only update their own info)."""

    name: str | None = Field(
        None, min_length=1, max_length=255, description="User name"
    )


class UserPasswordUpdateRequest(BaseModel):
    """Password update request schema (self-service)."""

    current_password: str = Field(..., description="Current password")
    new_password: str = Field(
        ..., min_length=6, description="New password (min 6 characters)"
    )


class AdminPasswordResetRequest(BaseModel):
    """Admin password reset request schema."""

    new_password: str = Field(
        ..., min_length=6, description="New password (min 6 characters)"
    )


class UserResponse(BaseModel):
    """User response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserListResponse(BaseResponse[list[UserResponse]]):
    """User list response schema."""

    total: int


class UserDetailResponse(BaseResponse[UserResponse]):
    """User detail response schema."""


class UserCreateResponse(BaseResponse[UserResponse]):
    """User creation response schema."""


class UserUpdateResponse(BaseResponse[UserResponse]):
    """User update response schema."""


class PasswordResetResponse(BaseResponse[None]):
    """Password reset response schema."""

    message: str = "Password reset successfully"
