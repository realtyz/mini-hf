"""User service."""

from __future__ import annotations

from database.db_models import User
from database.db_repositories import UserRepository
from loguru import logger
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from mgmt_server.core.constants import UserRole
from mgmt_server.core.exceptions import ConflictError, NotFoundError, ValidationError
from mgmt_server.core.security import hash_password, verify_password


def _mask_email(email: str) -> str:
    """Mask email for logging (e.g. 'alice@example.com' -> 'a***@example.com')."""
    if "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    if len(local) <= 1:
        return f"*@{domain}"
    return f"{local[0]}***@{domain}"


class UserService:
    """User service for business logic."""

    def __init__(self, session: AsyncSession):
        self._session = session
        self._repo = UserRepository(session)

    async def authenticate(self, email: str, password: str) -> User | None:
        """Authenticate user with email and password."""
        user = await self._repo.get_by_email(email)
        if (
            not user
            or not user.is_active
            or not verify_password(password, user.hashed_password)
        ):
            logger.debug("Authentication failed for user: {}", _mask_email(email))
            return None
        return user

    async def get_by_email(self, email: str) -> User | None:
        """Get user by email."""
        return await self._repo.get_by_email(email)

    async def get_by_id(self, user_id: int) -> User | None:
        """Get user by ID."""
        logger.debug("Fetching user by ID: {}", user_id)
        return await self._repo.get_by_id(user_id)

    async def get_by_name(self, name: str) -> User | None:
        """Get user by name."""
        logger.debug("Fetching user by name: {}", name)
        return await self._repo.get_by_name(name)

    async def create_user(
        self,
        name: str,
        email: str,
        password: str,
        role: UserRole = UserRole.USER,
        is_active: bool = True,
    ) -> User:
        """Create a new user.

        Raises:
            ConflictError: If email already exists
        """
        logger.info("Creating new user: {}", _mask_email(email))

        existing_user = await self._repo.get_by_email(email)
        if existing_user:
            logger.warning("User with email already exists: {}", _mask_email(email))
            raise ConflictError("A user with this email already exists")

        hashed_password = hash_password(password)
        try:
            user = await self._repo.create(
                name=name,
                email=email,
                hashed_password=hashed_password,
                role=role,
                is_active=is_active,
            )
        except IntegrityError:
            # Race condition: another request created the user between check and create
            await self._session.rollback()
            logger.warning(
                "Integrity error when creating user (email conflict): {}",
                _mask_email(email),
            )
            raise ConflictError("A user with this email already exists")

        logger.info("User created successfully: {}", _mask_email(email))
        return user

    async def list_users(
        self, skip: int = 0, limit: int = 20, email_search: str | None = None
    ) -> tuple[list[User], int]:
        """List users with pagination and optional email fuzzy search."""
        logger.debug(
            "Listing users with skip={}, limit={}, email_search={}",
            skip,
            limit,
            email_search,
        )
        return await self._repo.list_users(
            skip=skip, limit=limit, email_search=email_search
        )

    async def get_or_raise(self, user_id: int) -> User:
        """Fetch user by ID or raise NotFoundError."""
        user = await self._repo.get_by_id(user_id)
        if not user:
            raise NotFoundError(f"User with ID {user_id} not found")
        return user

    async def _update_password(self, user: User, new_password: str) -> None:
        """Hash and set new password for a user."""
        user.hashed_password = hash_password(new_password)
        await self._repo.update(user)

    async def update_user(
        self,
        user_id: int,
        name: str | None = None,
        email: str | None = None,
        role: UserRole | None = None,
        is_active: bool | None = None,
    ) -> User:
        """Update user information.

        Raises:
            NotFoundError: If user not found
            ConflictError: If email already exists
        """
        logger.info("Updating user {}", user_id)

        user = await self.get_or_raise(user_id)

        if email is not None and email != user.email:
            existing = await self._repo.get_by_email(email)
            if existing:
                raise ConflictError("Email already exists")
            user.email = email

        if name is not None:
            user.name = name
        if role is not None:
            user.role = role
        if is_active is not None:
            user.is_active = is_active

        await self._repo.update(user)
        logger.info("User {} updated successfully", user_id)
        return user

    async def change_password(
        self, user_id: int, current_password: str, new_password: str
    ) -> None:
        """Change user password (requires current password).

        Raises:
            NotFoundError: If user not found
            ValidationError: If current password is incorrect
        """
        logger.info("Changing password for user {}", user_id)

        user = await self.get_or_raise(user_id)

        if not verify_password(current_password, user.hashed_password):
            raise ValidationError("Current password is incorrect")

        await self._update_password(user, new_password)
        logger.info("Password changed successfully for user {}", user_id)

    async def admin_reset_password(self, user_id: int, new_password: str) -> None:
        """Reset user password (admin only, no current password required).

        Raises:
            NotFoundError: If user not found
        """
        logger.info("Admin resetting password for user {}", user_id)

        user = await self.get_or_raise(user_id)

        await self._update_password(user, new_password)
        logger.info("Password reset successfully for user {}", user_id)

    async def deactivate_user_with_admin_check(self, user_id: int) -> None:
        """Deactivate a user, atomically checking they aren't the last active admin.

        Uses SELECT ... FOR UPDATE to lock admin rows during the check, preventing
        concurrent requests from both passing and deleting the last admin.

        Raises:
            NotFoundError: If user not found
            ValidationError: If user is the last active admin
        """
        logger.info("Deactivating user {} with admin check", user_id)

        user = await self.get_or_raise(user_id)

        if user.role == UserRole.ADMIN and user.is_active:
            remaining = await self._repo.lock_and_count_active_admins(
                exclude_user_id=user_id
            )
            if remaining < 1:
                raise ValidationError("Cannot deactivate the last active admin user")

        user.is_active = False
        user.is_deleted = True
        await self._repo.update(user)
        logger.info("User {} deactivated successfully", user_id)

    async def deactivate_user(self, user_id: int) -> None:
        """Deactivate and logically delete a user.

        Raises:
            NotFoundError: If user not found
        """
        logger.info("Deactivating user {}", user_id)

        user = await self.get_or_raise(user_id)

        user.is_active = False
        user.is_deleted = True
        await self._repo.update(user)
        logger.info("User {} deactivated successfully", user_id)
