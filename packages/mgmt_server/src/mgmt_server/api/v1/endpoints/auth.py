"""Authentication endpoints."""

import asyncio
import time
from datetime import timedelta
from typing import Annotated

from loguru import logger
from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm

from core.settings import settings
from mgmt_server.api.deps import (
    CurrentUserToken,
    RefreshUser,
    TokenServiceDep,
    UserServiceDep,
    VerifyCodeServiceDep,
)
from mgmt_server.api.v1.schemas.auth import (
    ForgotPasswordData,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginResponse,
    LogoutRequest,
    RefreshTokenResponse,
    ResetPasswordRequest,
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
from mgmt_server.core.constants import (
    VERIFY_CODE_MIN_ELAPSED,
    VERIFY_CODE_RESEND_AFTER,
    UserRole,
)
from mgmt_server.core.exceptions import (
    ConflictError,
    PermissionDeniedError,
    UnauthorizedError,
    ValidationError,
)
from mgmt_server.core.security import (
    build_token_payload,
    create_access_token,
    create_refresh_token,
    decode_access_token,
)
from mgmt_server.services.token_service import TokenReplayError
from mgmt_server.services.user_service import UserService


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
        raise UnauthorizedError("Invalid email or password")

    access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = build_token_payload(user.email, user.id, user.role)
    access_token, access_jti = create_access_token(
        data=payload,
        expires_delta=access_token_expires,
    )
    refresh_token, family_id, jti = create_refresh_token(data=payload)
    await token_service.create_family(user_id=user.id, jti=jti, family_id=family_id)

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


async def _create_and_respond_user(
    name: str,
    email: str,
    password: str,
    user_service: UserService,
) -> UserCreateResponse:
    """Create a user and return the response."""
    user = await user_service.create_user(
        name=name,
        email=email,
        password=password,
        role=UserRole.USER,
    )
    return UserCreateResponse(data=UserResponse.model_validate(user))


@router.post(
    "/register", response_model=UserCreateResponse, status_code=status.HTTP_201_CREATED
)
async def register_user(
    request: UserRegisterRequest,
    user_service: UserServiceDep,
) -> UserCreateResponse:
    """Register a new user (self-registration)."""
    return await _create_and_respond_user(
        name=request.name,
        email=request.email,
        password=request.password,
        user_service=user_service,
    )


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

    existing_user = await user_service.get_by_email(request.email)
    if existing_user:
        # Both branches perform SMTP I/O, but the templates differ so
        # processing time may vary. The MIN_ELAPSED floor below ensures
        # the total response time is not distinguishable.
        try:
            await verify_code_service.send_already_registered_notification(
                request.email,
            )
        except Exception as e:
            logger.warning("Failed to send already registered notification: {}", e)
        elapsed = time.monotonic() - start
        if elapsed < VERIFY_CODE_MIN_ELAPSED:
            await asyncio.sleep(VERIFY_CODE_MIN_ELAPSED - elapsed)
        return SendVerifyCodeResponse(
            data=SendVerifyCodeData(resend_after=VERIFY_CODE_RESEND_AFTER),
        )

    success, message, resend_after = await verify_code_service.send_code(
        email=request.email,
    )

    if not success:
        raise ValidationError(message)

    elapsed = time.monotonic() - start
    if elapsed < VERIFY_CODE_MIN_ELAPSED:
        await asyncio.sleep(VERIFY_CODE_MIN_ELAPSED - elapsed)
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
        delete_on_success=False,
    )

    if not success:
        raise ValidationError(message)

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
        raise ValidationError(message)

    # Re-check email after verification to close TOCTOU window
    existing_user = await user_service.get_by_email(request.email)
    if existing_user:
        raise ConflictError("A user with this email already exists")

    return await _create_and_respond_user(
        name=request.name,
        email=request.email,
        password=request.password,
        user_service=user_service,
    )


# --- Password reset ---


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    request: ForgotPasswordRequest,
    verify_code_service: VerifyCodeServiceDep,
) -> ForgotPasswordResponse:
    """Send password reset code via email.

    Always returns a uniform response to prevent user enumeration.
    """
    success, message, resend_after = await verify_code_service.send_reset_code(
        email=request.email,
    )

    if not success:
        raise ValidationError(message)

    return ForgotPasswordResponse(
        data=ForgotPasswordData(resend_after=resend_after),
    )


@router.post("/reset-password", response_model=ForgotPasswordResponse)
async def reset_password(
    request: ResetPasswordRequest,
    user_service: UserServiceDep,
    verify_code_service: VerifyCodeServiceDep,
) -> ForgotPasswordResponse:
    """Reset password using verification code.

    Verifies the code then updates the user's password. User must exist
    and be active.
    """
    # Verify the reset code
    success, message = await verify_code_service.verify_reset_code(
        email=request.email,
        code=request.code,
    )

    if not success:
        raise ValidationError(message)

    # Find user and update password
    await user_service.reset_password_by_email(
        email=request.email,
        new_password=request.new_password,
    )

    return ForgotPasswordResponse(
        data=ForgotPasswordData(resend_after=0),
    )


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
        raise UnauthorizedError("Invalid refresh token: missing family_id or jti")

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
        raise UnauthorizedError("Refresh token has been revoked. Please sign in again.")

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
    body: LogoutRequest,
    user: RefreshUser,
    token_service: TokenServiceDep,
) -> None:
    """Logout by revoking the refresh token family and the current access token.

    Accepts the refresh token in the Authorization header and an optional
    access_token in the request body for immediate revocation.
    Revokes the entire refresh token family on the server side.
    """
    logger.info("User {} logged out", user.email)
    if user.family_id:
        await token_service.revoke_family(user.family_id)

    # Revoke the current access token so it cannot be reused
    payload = decode_access_token(body.access_token)
    if payload:
        if payload.get("sub") != user.email:
            raise PermissionDeniedError(
                "Access token does not belong to the authenticated user"
            )
        if payload.get("jti"):
            await token_service.revoke_access_token(payload["jti"])
