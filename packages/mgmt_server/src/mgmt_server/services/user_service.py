"""User service."""

from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from mgmt_server.core.security import hash_password, verify_password
from database.db_models import User
from database.db_repositories import UserRepository


class UserService:
    """User service for business logic."""

    def __init__(self, session: AsyncSession):
        """Initialize user service.

        Args:
            session: Database session
        """
        self.session = session
        self._repo = UserRepository(session)

    async def authenticate(self, email: str, password: str) -> Optional[User]:
        """Authenticate user with email and password.

        Args:
            email: User email
            password: Plain text password

        Returns:
            User if authentication succeeds, None otherwise
        """
        logger.debug("Authenticating user with email: %s", email)
        user = await self._repo.get_by_email(email)
        if not user:
            logger.debug("User not found: %s", email)
            return None
        if not user.is_active:
            logger.debug("User is inactive: %s", email)
            return None
        if not verify_password(password, user.hashed_password):
            logger.debug("Password verification failed for user: %s", email)
            return None
        logger.debug("User authenticated successfully: %s", email)
        return user

    async def get_by_email(self, email: str) -> Optional[User]:
        """Get user by email.

        Args:
            email: Email to search for

        Returns:
            User if found, None otherwise
        """
        return await self._repo.get_by_email(email)

    async def get_by_id(self, user_id: int) -> Optional[User]:
        """Get user by ID.

        Args:
            user_id: User ID to search for

        Returns:
            User if found, None otherwise
        """
        logger.debug("Fetching user by ID: %s", user_id)
        return await self._repo.get_by_id(user_id)

    async def get_by_name(self, name: str) -> Optional[User]:
        """Get user by name.

        Args:
            name: Name to search for

        Returns:
            User if found, None otherwise
        """
        logger.debug("Fetching user by name: %s", name)
        return await self._repo.get_by_name(name)

    async def create_user(
        self, name: str, email: str, password: str, role: str = "user"
    ) -> User:
        """Create a new user.

        Args:
            name: User name
            email: User email
            password: Plain text password
            role: User role (default: "user")

        Returns:
            Created user

        Raises:
            ValueError: If email already exists
        """
        logger.info("Creating new user with email: %s", email)

        # Check if user already exists
        existing_user = await self._repo.get_by_email(email)
        if existing_user:
            logger.warning("User with email %s already exists", email)
            raise ValueError(f"User with email {email} already exists")

        # Hash password
        hashed_password = hash_password(password)

        # Create user
        user = await self._repo.create(
            name=name,
            email=email,
            hashed_password=hashed_password,
            role=role,
        )
        logger.info("User created successfully: %s", email)
        return user

    async def list_users(
        self, skip: int = 0, limit: int = 20
    ) -> tuple[list[User], int]:
        """List users with pagination.

        Args:
            skip: Number of users to skip
            limit: Number of users to return

        Returns:
            Tuple of (users list, total count)
        """
        logger.debug("Listing users with skip=%s, limit=%s", skip, limit)
        return await self._repo.list_users(skip=skip, limit=limit)

    async def update_user(
        self,
        user_id: int,
        name: str | None = None,
        email: str | None = None,
        role: str | None = None,
        is_active: bool | None = None,
    ) -> User:
        """Update user information.

        Args:
            user_id: User ID to update
            name: New name (optional)
            email: New email (optional)
            role: New role (optional)
            is_active: New active status (optional)

        Returns:
            Updated user

        Raises:
            ValueError: If user not found or email already exists
        """
        logger.info("Updating user %s", user_id)

        # Get user
        user = await self._repo.get_by_id(user_id)
        if not user:
            raise ValueError(f"User with ID {user_id} not found")

        # Check email uniqueness if changing email
        if email is not None and email != user.email:
            existing = await self._repo.get_by_email(email)
            if existing:
                raise ValueError(f"Email {email} already exists")
            user.email = email

        # Update fields
        if name is not None:
            user.name = name
        if role is not None:
            user.role = role
        if is_active is not None:
            user.is_active = is_active

        await self._repo.update(user)
        logger.info("User %s updated successfully", user_id)
        return user

    async def change_password(
        self, user_id: int, current_password: str, new_password: str
    ) -> None:
        """Change user password (requires current password).

        Args:
            user_id: User ID
            current_password: Current password
            new_password: New password

        Raises:
            ValueError: If user not found or current password is incorrect
        """
        logger.info("Changing password for user %s", user_id)

        user = await self._repo.get_by_id(user_id)
        if not user:
            raise ValueError("User not found")

        if not verify_password(current_password, user.hashed_password):
            raise ValueError("Current password is incorrect")

        user.hashed_password = hash_password(new_password)
        await self._repo.update(user)
        logger.info("Password changed successfully for user %s", user_id)

    async def admin_reset_password(self, user_id: int, new_password: str) -> None:
        """Reset user password (admin only, no current password required).

        Args:
            user_id: User ID
            new_password: New password

        Raises:
            ValueError: If user not found
        """
        logger.info("Admin resetting password for user %s", user_id)

        user = await self._repo.get_by_id(user_id)
        if not user:
            raise ValueError("User not found")

        user.hashed_password = hash_password(new_password)
        await self._repo.update(user)
        logger.info("Password reset successfully for user %s", user_id)

    async def deactivate_user(self, user_id: int) -> None:
        """Deactivate and logically delete a user.

        Args:
            user_id: User ID to deactivate

        Raises:
            ValueError: If user not found
        """
        logger.info("Deactivating user %s", user_id)

        user = await self._repo.get_by_id(user_id)
        if not user:
            raise ValueError("User not found")

        user.is_active = False
        user.is_deleted = True
        await self._repo.update(user)
        logger.info("User %s deactivated successfully", user_id)
