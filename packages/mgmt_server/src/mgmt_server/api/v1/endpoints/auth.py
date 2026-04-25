"""Authentication endpoints."""

import asyncio
import time
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from loguru import logger

from core.settings import settings
from mgmt_server.api.deps import (
    CurrentUserToken,
    RefreshUser,
    TokenServiceDep,
    UserServiceDep,
    VerifyCodeServiceDep,
)
from mgmt_server.api.v1.schemas.auth import (
    LoginResponse,
    RefreshTokenResponse,
    TokenData,
    RegisterWithCodeRequest,
    SendVerifyCodeData,
    SendVerifyCodeRequest,
    SendVerifyCodeResponse,
    TokenVerifyData,
    TokenVerifyResponse,
    VerifyEmailData,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from mgmt_server.api.v1.schemas.users import (
    UserCreateResponse,
    UserRegisterRequest,
    UserResponse,
)
from mgmt_server.core.constants import UserRole
from mgmt_server.core.security import (
    build_token_payload,
    create_access_token,
    create_refresh_token,
)
from mgmt_server.services.token_service import TokenReplayError


router = APIRouter()


@router.post("/sign-in", response_model=LoginResponse)
async def sign_in(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    user_service: UserServiceDep,
    token_service: TokenServiceDep,
) -> LoginResponse:
    """Login with email and password, returns JWT access token.

    Uses OAuth2PasswordRequestForm for standard OAuth2 password flow.
    """
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

    access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = build_token_payload(user.email, user.id, user.role)
    access_token, access_jti = create_access_token(
        data=payload,
        expires_delta=access_token_expires,
    )
    refresh_token, family_id, jti = create_refresh_token(data=payload)
    await token_service.create_family(user_id=user.id, jti=jti)

    return LoginResponse(
        data=TokenData(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
    )


@router.get("/verify", response_model=TokenVerifyResponse)
async def verify_token_endpoint(
    current_user: CurrentUserToken,
) -> TokenVerifyResponse:
    """Verify if the current token is valid."""
    return TokenVerifyResponse(
        data=TokenVerifyData(
            valid=True,
            email=current_user.email,
            user_id=current_user.user_id,
            role=current_user.role,
        )
    )


@router.post(
    "/register", response_model=UserCreateResponse, status_code=status.HTTP_201_CREATED
)
async def register_user(
    request: UserRegisterRequest,
    user_service: UserServiceDep,
) -> UserCreateResponse:
    """Register a new user (self-registration)."""
    user = await user_service.create_user(
        name=request.name,
        email=request.email,
        password=request.password,
        role=UserRole.USER,
    )
    return UserCreateResponse(data=UserResponse.model_validate(user))


# --- Email verification code APIs ---


@router.post("/send-verify-code", response_model=SendVerifyCodeResponse)
async def send_verify_code(
    request: SendVerifyCodeRequest,
    user_service: UserServiceDep,
    verify_code_service: VerifyCodeServiceDep,
) -> SendVerifyCodeResponse:
    """Send email verification code.

    Returns a uniform response regardless of whether the email is already
    registered, to prevent user enumeration attacks. A minimum elapsed-time
    floor is enforced so that timing differences between the two SMTP paths
    (notification vs verification code) cannot be used to distinguish them.
    """
    start = time.monotonic()
    # Floor time masks SMTP timing differences between branches.
    MIN_ELAPSED = 2.0

    existing_user = await user_service.get_by_email(request.email)
    if existing_user:
        # Both branches perform SMTP I/O, but the templates differ so
        # processing time may vary. The MIN_ELAPSED floor below ensures
        # the total response time is not distinguishable.
        try:
            await verify_code_service.send_already_registered_notification(
                request.email,
            )
        except Exception:
            pass  # swallow errors to avoid leaking registered-user info
        elapsed = time.monotonic() - start
        if elapsed < MIN_ELAPSED:
            await asyncio.sleep(MIN_ELAPSED - elapsed)
        return SendVerifyCodeResponse(
            data=SendVerifyCodeData(resend_after=60),
        )

    success, message, resend_after = await verify_code_service.send_code(
        email=request.email,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )

    elapsed = time.monotonic() - start
    if elapsed < MIN_ELAPSED:
        await asyncio.sleep(MIN_ELAPSED - elapsed)
    return SendVerifyCodeResponse(
        data=SendVerifyCodeData(resend_after=resend_after),
    )


@router.post("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(
    request: VerifyEmailRequest,
    verify_code_service: VerifyCodeServiceDep,
) -> VerifyEmailResponse:
    """Verify email verification code."""
    success, message = await verify_code_service.verify_code(
        email=request.email,
        code=request.code,
        delete_on_success=True,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )

    return VerifyEmailResponse(
        data=VerifyEmailData(verified=True, email=request.email),
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
    """Register with verification code.

    Verifies the code first, then creates the user.
    Re-checks email existence after verification to mitigate TOCTOU race.
    """
    # Verify the code
    success, message = await verify_code_service.verify_code(
        email=request.email,
        code=request.code,
        delete_on_success=True,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )

    # Re-check email after verification to close TOCTOU window
    user = await user_service.create_user(
        name=request.name,
        email=request.email,
        password=request.password,
        role=UserRole.USER,
    )
    return UserCreateResponse(data=UserResponse.model_validate(user))


@router.post("/refresh", response_model=RefreshTokenResponse)
async def refresh_access_token(
    user: RefreshUser,
    token_service: TokenServiceDep,
) -> RefreshTokenResponse:
    """Refresh access token using refresh token.

    Implements Refresh Token Rotation with server-side family tracking:
    - Validates the refresh token's jti against Redis
    - Detects replay attacks (reused token) and revokes the entire family
    - Issues new access + refresh tokens, rotating the jti
    """
    if not user.family_id or not user.jti:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token: missing family_id or jti",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        new_refresh_token, family_id, new_jti = create_refresh_token(
            data=build_token_payload(user.email, user.user_id, user.role),
            family_id=user.family_id,
        )
        await token_service.validate_and_rotate(
            family_id=user.family_id,
            jti=user.jti,
            new_jti=new_jti,
        )
    except TokenReplayError as e:
        logger.warning("Refresh token replay: {}", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token, _access_jti = create_access_token(
        data=build_token_payload(user.email, user.user_id, user.role),
        expires_delta=access_token_expires,
    )

    return RefreshTokenResponse(
        data=TokenData(
            access_token=access_token,
            refresh_token=new_refresh_token,
            token_type="bearer",
            expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    user: RefreshUser,
    token_service: TokenServiceDep,
) -> None:
    """Logout by revoking the refresh token family and the current access token.

    Accepts the refresh token in the Authorization header and an optional
    X-Access-Token header with the current access token for immediate revocation.
    Revokes the entire refresh token family on the server side.
    """
    if user.family_id:
        await token_service.revoke_family(user.family_id)

    # Revoke the current access token so it cannot be reused
    access_token = request.headers.get("X-Access-Token")
    if access_token:
        from mgmt_server.core.security import decode_access_token

        payload = decode_access_token(access_token)
        if payload and payload.get("jti"):
            await token_service.revoke_access_token(payload["jti"])
