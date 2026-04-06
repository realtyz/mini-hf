"""Authentication schemas."""

from pydantic import BaseModel, EmailStr, Field

from mgmt_server.api.v1.schemas.base import BaseResponse


class LoginRequest(BaseModel):
    """Login request schema."""

    email: str
    password: str


class LoginResponse(BaseModel):
    """Login response schema with refresh token."""

    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int = Field(..., description="Access token expiration time in seconds")


class RefreshTokenRequest(BaseModel):
    """Refresh token request schema."""

    refresh_token: str


class RefreshTokenResponse(BaseModel):
    """Refresh token response schema."""

    access_token: str
    token_type: str
    expires_in: int = Field(..., description="Access token expiration time in seconds")


class TokenVerifyResponse(BaseResponse):
    """Token verify response schema."""

    data: dict = {
        "valid": True,
        "email": "",
    }


# ==================== 邮箱验证码相关 ====================


class SendVerifyCodeRequest(BaseModel):
    """发送验证码请求."""

    email: EmailStr = Field(..., description="邮箱地址")


class SendVerifyCodeResponse(BaseResponse[dict]):
    """发送验证码响应."""

    data: dict = {
        "resend_after": 60,
    }


class VerifyEmailRequest(BaseModel):
    """验证邮箱请求."""

    email: EmailStr = Field(..., description="邮箱地址")
    code: str = Field(..., min_length=6, max_length=6, description="6位验证码")


class VerifyEmailResponse(BaseResponse[dict]):
    """验证邮箱响应."""

    data: dict = {
        "verified": True,
        "email": "",
    }


class RegisterWithCodeRequest(BaseModel):
    """通过验证码注册请求."""

    email: EmailStr = Field(..., description="邮箱地址")
    code: str = Field(..., min_length=6, max_length=6, description="6位验证码")
    name: str = Field(..., min_length=1, max_length=255, description="用户名")
    password: str = Field(..., min_length=6, description="密码（至少6位）")
