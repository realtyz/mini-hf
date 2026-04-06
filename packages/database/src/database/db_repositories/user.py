"""User repository."""

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.db_models import User


class UserRepository:
    """User repository for database operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_email(self, email: str) -> Optional[User]:
        """Get user by email.

        Args:
            email: Email to search for

        Returns:
            User if found, None otherwise
        """
        result = await self.session.execute(
            select(User).where(User.email == email, User.is_deleted == False)
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: int) -> Optional[User]:
        """Get user by ID.

        Args:
            user_id: User ID to search for

        Returns:
            User if found, None otherwise
        """
        return await self.session.get(User, user_id)

    async def get_by_name(self, name: str) -> Optional[User]:
        """Get user by name.

        Args:
            name: Name to search for

        Returns:
            User if found, None otherwise
        """
        result = await self.session.execute(
            select(User).where(User.name == name, User.is_deleted == False)
        )
        return result.scalar_one_or_none()

    async def create(
        self, name: str, email: str, hashed_password: str, role: str = "user"
    ) -> User:
        """Create a new user.

        Args:
            name: User name
            email: User email
            hashed_password: Hashed password
            role: User role (default: "user")

        Returns:
            Created user
        """
        user = User(
            name=name,
            email=email,
            hashed_password=hashed_password,
            role=role,
        )
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return user

    async def list_users(self, skip: int = 0, limit: int = 20) -> tuple[list[User], int]:
        """List users with pagination.

        Args:
            skip: Number of users to skip
            limit: Number of users to return

        Returns:
            Tuple of (users list, total count)
        """
        # Get total count (excluding deleted users)
        count_result = await self.session.execute(
            select(User).where(User.is_deleted == False)
        )
        total = len(count_result.scalars().all())

        # Get paginated users (excluding deleted users)
        result = await self.session.execute(
            select(User).where(User.is_deleted == False).offset(skip).limit(limit)
        )
        users = list(result.scalars().all())
        return users, total

    async def update(self, user: User) -> User:
        """Update user.

        Args:
            user: User to update

        Returns:
            Updated user
        """
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return user
