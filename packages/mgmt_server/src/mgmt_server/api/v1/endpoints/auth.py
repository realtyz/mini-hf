"""Authentication endpoints."""

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from core.settings import settings
from mgmt_server.api.deps import (
    CurrentUserToken,
    RefreshUser,
    UserServiceDep,
    VerifyCodeServiceDep,
)
from mgmt_server.api.v1.schemas.auth import (
    LoginResponse,
    RefreshTokenResponse,
    RegisterWithCodeRequest,
    SendVerifyCodeRequest,
    SendVerifyCodeResponse,
    TokenVerifyResponse,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from mgmt_server.api.v1.schemas.users import (
    UserCreateResponse,
    UserRegisterRequest,
    UserResponse,
)
from mgmt_server.core.security import create_access_token, create_refresh_token


router = APIRouter()


@router.post("/sign-in", response_model=LoginResponse)
async def sign_in(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    user_service: UserServiceDep,
) -> LoginResponse:
    """Login with email and password, returns JWT access token.

    Uses OAuth2PasswordRequestForm for standard OAuth2 password flow.

    Args:
        form_data: OAuth2 form data with username (email) and password
        user_service: User service dependency

    Returns:
        Login response with access token and token type

    Raises:
        HTTPException: If credentials are invalid
    """
    # Authenticate user using user service
    # OAuth2PasswordRequestForm uses 'username' field for the identifier (email)
    user = await user_service.authenticate(
        email=form_data.username,
        password=form_data.password,
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create access token with user info
    access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": user.email,
            "user_id": user.id,
            "role": user.role,
        },
        expires_delta=access_token_expires,
    )

    # Create refresh token
    refresh_token = create_refresh_token(
        data={
            "sub": user.email,
            "user_id": user.id,
            "role": user.role,
        }
    )

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/verify", response_model=TokenVerifyResponse)
async def verify_token_endpoint(
    current_user: CurrentUserToken,
) -> TokenVerifyResponse:
    """Verify if the current token is valid.

    Args:
        current_user: Current authenticated user token payload

    Returns:
        Token verification response with user info
    """
    return TokenVerifyResponse(
        data={
            "valid": True,
            "email": current_user.email,
            "user_id": current_user.user_id,
            "role": current_user.role,
        }
    )


@router.post(
    "/register", response_model=UserCreateResponse, status_code=status.HTTP_201_CREATED
)
async def register_user(
    request: UserRegisterRequest,
    user_service: UserServiceDep,
) -> UserCreateResponse:
    """Register a new user (self-registration).

    Args:
        request: Registration request with name, email, password
        user_service: User service dependency

    Returns:
        Created user information (role defaults to "user")

    Raises:
        HTTPException: If email already exists or validation fails
    """
    try:
        user = await user_service.create_user(
            name=request.name,
            email=request.email,
            password=request.password,
            role="user",  # Self-registered users always get "user" role
        )
        return UserCreateResponse(data=UserResponse.model_validate(user))
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )


# ==================== 邮箱验证码相关 API ====================


@router.post("/send-verify-code", response_model=SendVerifyCodeResponse)
async def send_verify_code(
    request: SendVerifyCodeRequest,
    user_service: UserServiceDep,
    verify_code_service: VerifyCodeServiceDep,
) -> SendVerifyCodeResponse:
    """发送邮箱验证码.

    Args:
        request: 发送验证码请求
        user_service: 用户服务
        verify_code_service: 验证码服务

    Returns:
        发送结果和下次可重发时间

    Raises:
        HTTPException: 如果邮箱已注册或发送失败
    """
    # 检查邮箱是否已注册
    existing_user = await user_service.get_by_email(request.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被注册",
        )

    # 发送验证码
    success, message, resend_after = await verify_code_service.send_code(
        email=request.email,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )

    return SendVerifyCodeResponse(
        data={
            "resend_after": resend_after,
        }
    )


@router.post("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(
    request: VerifyEmailRequest,
    verify_code_service: VerifyCodeServiceDep,
) -> VerifyEmailResponse:
    """验证邮箱验证码.

    Args:
        request: 验证请求
        verify_code_service: 验证码服务

    Returns:
        验证结果

    Raises:
        HTTPException: 如果验证码无效或已过期
    """
    success, message = await verify_code_service.verify_code(
        email=request.email,
        code=request.code,
        delete_on_success=False,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )

    return VerifyEmailResponse(
        data={
            "verified": True,
            "email": request.email,
        }
    )


@router.post(
    "/register-with-code",
    response_model=UserCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_with_code(
    request: RegisterWithCodeRequest,
    user_service: UserServiceDep,
    verify_code_service: VerifyCodeServiceDep,
) -> UserCreateResponse:
    """通过验证码注册.

    先验证验证码，验证通过后创建用户。

    Args:
        request: 注册请求
        user_service: 用户服务
        verify_code_service: 验证码服务

    Returns:
        创建的用户信息

    Raises:
        HTTPException: 如果验证码无效或邮箱已注册
    """
    # 验证验证码
    success, message = await verify_code_service.verify_code(
        email=request.email,
        code=request.code,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )

    # 创建用户
    try:
        user = await user_service.create_user(
            name=request.name,
            email=request.email,
            password=request.password,
            role="user",
        )
        return UserCreateResponse(data=UserResponse.model_validate(user))
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )


@router.post("/refresh", response_model=RefreshTokenResponse)
async def refresh_access_token(
    refresh_user: RefreshUser,
) -> RefreshTokenResponse:
    """Refresh access token using refresh token.

    Args:
        refresh_user: User authenticated via refresh token

    Returns:
        New access token response

    Raises:
        HTTPException: If refresh token is invalid or user is inactive
    """
    # Create new access token
    access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": refresh_user.email,
            "user_id": refresh_user.user_id,
            "role": refresh_user.role,
        },
        expires_delta=access_token_expires,
    )

    return RefreshTokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
