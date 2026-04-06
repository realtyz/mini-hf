"""Database initialization script for creating default admin user."""

from loguru import logger

from core.settings import settings
from database.core import AsyncSessionLocal
from database.db_repositories import UserRepository
from mgmt_server.core.security import hash_password


async def init_db() -> None:
    """Initialize database with default admin user if no admin exists.

    This function checks if any admin user exists in the database.
    If not, it creates a default admin user using the environment
    variables DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD.
    """
    async with AsyncSessionLocal() as session:
        repo = UserRepository(session)

        try:
            # Check if any admin user already exists
            if await repo.admin_exists():
                logger.info("Admin user already exists, skipping default admin creation")
                return

            # Create default admin user
            await _create_default_admin(repo)
            logger.info("Default admin user created successfully")

        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise


async def _create_default_admin(repo: UserRepository) -> None:
    """Create the default admin user.

    Args:
        repo: User repository instance

    Raises:
        ValueError: If admin user with the email already exists
    """
    email = settings.DEFAULT_ADMIN_EMAIL
    password = settings.DEFAULT_ADMIN_PASSWORD

    # Extract username from email (part before @)
    name = email.split("@")[0]

    logger.info(f"Creating default admin user with email: {email}")

    # Check if user with this email already exists
    existing_user = await repo.get_by_email(email)

    if existing_user:
        logger.warning(f"User with email {email} already exists, skipping creation")
        return

    # Hash password and create user
    hashed_password = hash_password(password)

    await repo.create(
        name=name,
        email=email,
        hashed_password=hashed_password,
        role="admin"
    )

    logger.info(f"Default admin user '{name}' created with email '{email}'")
