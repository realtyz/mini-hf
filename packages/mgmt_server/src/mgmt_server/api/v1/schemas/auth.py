"""Authentication schemas."""

from pydantic import BaseModel, EmailStr, Field

from mgmt_server.api.v1.schemas.base import BaseResponse


class TokenData(BaseModel):
    """Token response data (used for login and refresh)."""

    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int = Field(..., description="Access token expiration time in seconds")


class LoginResponse(BaseResponse[TokenData]):
    """Login response schema with refresh token."""


class RefreshTokenResponse(BaseResponse[TokenData]):
    """Refresh token response schema with token rotation."""


class TokenVerifyData(BaseModel):
    """Token verify response data."""

    valid: bool
    email: str
    user_id: int
    role: str


class TokenVerifyResponse(BaseResponse[TokenVerifyData]):
    """Token verify response schema."""


# --- Email verification code ---


class SendVerifyCodeRequest(BaseModel):
    """Send verification code request."""

    email: EmailStr = Field(..., description="Email address")


class SendVerifyCodeData(BaseModel):
    """Send verification code response data."""

    resend_after: int = Field(60, description="Seconds until next code can be sent")


class SendVerifyCodeResponse(BaseResponse[SendVerifyCodeData]):
    """Send verification code response."""


class VerifyEmailRequest(BaseModel):
    """Verify email request."""

    email: EmailStr = Field(..., description="Email address")
    code: str = Field(
        ..., min_length=6, max_length=6, description="6-digit verification code"
    )


class VerifyEmailData(BaseModel):
    """Verify email response data."""

    verified: bool
    email: str = ""


class VerifyEmailResponse(BaseResponse[VerifyEmailData]):
    """Verify email response."""


class LogoutRequest(BaseModel):
    """Logout request with optional access token for immediate revocation."""

    access_token: str = Field(..., description="Current access token to revoke")


class RegisterWithCodeRequest(BaseModel):
    """Register with verification code request."""

    email: EmailStr = Field(..., description="Email address")
    code: str = Field(
        ..., min_length=6, max_length=6, description="6-digit verification code"
    )
    name: str = Field(..., min_length=1, max_length=255, description="User name")
    password: str = Field(
        ..., min_length=6, max_length=64, description="Password (min 6 characters)"
    )
