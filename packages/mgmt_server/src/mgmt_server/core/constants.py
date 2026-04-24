"""Core constants for mgmt_server."""

from enum import Enum


class UserRole(str, Enum):
    """User role enumeration."""

    ADMIN = "admin"
    USER = "user"


# Size conversions
BYTES_PER_GB = 1024**3

# Time windows
TASK_RETRY_WINDOW_DAYS = 7

# Preview task cache
PREVIEW_TASK_TTL = 600  # 10 minutes
PREVIEW_CACHE_TTL = 300  # 5 minutes
