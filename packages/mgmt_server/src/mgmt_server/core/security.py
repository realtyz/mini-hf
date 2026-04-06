"""Security utilities for JWT authentication."""

from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pwdlib import PasswordHash
from pwdlib.hashers.bcrypt import BcryptHasher

from core.settings import settings

# Password hashing using bcrypt (Windows compatible)
password_hash = PasswordHash((BcryptHasher(),))

# OAuth2 Bearer scheme for token authentication (Swagger UI + actual validation)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/sign-in")

# OAuth2 Bearer scheme for refresh token (Swagger UI)
oauth2_refresh_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/refresh", auto_error=False)


def create_refresh_token(data: dict) -> str:
    """Create a JWT refresh token with longer expiration.

    Args:
        data: Data to encode in the token (e.g., {"sub": user_id, "type": "refresh"})

    Returns:
        Encoded JWT refresh token string
    """
    to_encode = data.copy()
    # Refresh token expires in 7 days
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    return encoded_jwt


def hash_password(password: str) -> str:
    """Hash a plain text password.

    Args:
        password: Plain text password

    Returns:
        Hashed password string
    """
    return password_hash.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain text password against a hashed password.

    Args:
        plain_password: Plain text password from user input
        hashed_password: Hashed password stored in database

    Returns:
        True if password matches, False otherwise
    """
    return password_hash.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token with user info.

    Args:
        data: Data to encode in the token (e.g., {"sub": user_email, "user_id": 1, "role": "admin"})
        expires_delta: Optional custom expiration time

    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT access token.

    Args:
        token: JWT token string

    Returns:
        Decoded token payload or None if invalid
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        # Verify this is an access token, not a refresh token
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


def decode_refresh_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT refresh token.

    Args:
        token: JWT refresh token string

    Returns:
        Decoded token payload or None if invalid
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        # Verify this is a refresh token
        if payload.get("type") != "refresh":
            return None
        return payload
    except JWTError:
        return None


class TokenPayload:
    """Token payload with user info."""

    def __init__(self, payload: dict):
        self.email: str = payload.get("sub", "")
        self.user_id: int = payload.get("user_id", 0)
        self.role: str = payload.get("role", "")
        self.original_payload = payload


async def verify_bearer_token(
    token: Annotated[str, Depends(oauth2_scheme)],
) -> TokenPayload:
    """Verify bearer token and return token payload with user info.

    Args:
        token: JWT access token from OAuth2 scheme

    Returns:
        TokenPayload containing user email, user_id, and role

    Raises:
        HTTPException: If token is missing or invalid
    """
    payload = decode_access_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email: Optional[str] = payload.get("sub")
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return TokenPayload(payload)


async def verify_refresh_token(
    token: Annotated[Optional[str], Depends(oauth2_refresh_scheme)],
) -> TokenPayload:
    """Verify refresh token and return token payload.

    Args:
        token: JWT refresh token from OAuth2 scheme

    Returns:
        TokenPayload containing user info

    Raises:
        HTTPException: If token is missing or invalid
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_refresh_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email: Optional[str] = payload.get("sub")
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token: missing subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return TokenPayload(payload)
