"""User repository."""

from typing import Optional

from sqlalchemy import func, select
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
            select(User).where(User.email == email, User.is_deleted == False)  # noqa: E712
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
            select(User).where(User.name == name, User.is_deleted == False)  # noqa: E712
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        name: str,
        email: str,
        hashed_password: str,
        role: str = "user",
        is_active: bool = True,
    ) -> User:
        """Create a new user.

        Args:
            name: User name
            email: User email
            hashed_password: Hashed password
            role: User role (default: "user")
            is_active: Whether the user is active (default: True)

        Returns:
            Created user
        """
        user = User(
            name=name,
            email=email,
            hashed_password=hashed_password,
            role=role,
            is_active=is_active,
        )
        self.session.add(user)
        await self.session.flush()
        await self.session.refresh(user)
        return user

    async def list_users(
        self, skip: int = 0, limit: int = 20, email_search: Optional[str] = None
    ) -> tuple[list[User], int]:
        """List users with pagination and optional email fuzzy search.

        Args:
            skip: Number of users to skip
            limit: Number of users to return
            email_search: Optional email substring to search for (fuzzy match)

        Returns:
            Tuple of (users list, total count)
        """
        # Base query (excluding deleted users)
        base_query = select(User).where(User.is_deleted == False)  # noqa: E712

        # Add email search filter if provided
        if email_search:
            base_query = base_query.where(User.email.ilike(f"%{email_search}%"))

        # Get total count
        count_result = await self.session.execute(base_query)
        total = len(count_result.scalars().all())

        # Get paginated users
        result = await self.session.execute(base_query.offset(skip).limit(limit))
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
        await self.session.flush()
        await self.session.refresh(user)
        return user

    async def lock_and_count_active_admins(
        self, exclude_user_id: int | None = None
    ) -> int:
        """Atomically count active admins with row-level lock to prevent TOCTOU races.

        Uses SELECT ... FOR UPDATE to lock matched rows, ensuring concurrent
        delete/update requests serialize and can't both pass the count check.

        Args:
            exclude_user_id: If provided, exclude this user from the count
                (useful when checking before deactivating a specific admin).

        Returns:
            Number of active, non-deleted admin users.
        """
        query = (
            select(func.count())
            .select_from(User)
            .where(
                User.role == "admin",
                User.is_active == True,  # noqa: E712
                User.is_deleted == False,  # noqa: E712
            )
            .with_for_update()
        )
        if exclude_user_id is not None:
            query = query.where(User.id != exclude_user_id)
        result = await self.session.execute(query)
        return result.scalar_one()

    async def admin_exists(self) -> bool:
        """Check if any admin user exists in the database.

        Returns:
            True if at least one admin user exists, False otherwise
        """
        result = await self.session.execute(
            select(User).where(User.role == "admin", User.is_deleted == False)  # noqa: E712
        )
        return result.scalar_one_or_none() is not None
