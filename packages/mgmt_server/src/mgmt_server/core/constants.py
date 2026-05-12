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

# Auth timing
VERIFY_CODE_MIN_ELAPSED = 2.0  # seconds — masks SMTP timing differences
VERIFY_CODE_RESEND_AFTER = 60  # seconds — cooldown before resending code

# SMTP
SMTP_TEST_TIMEOUT = 10.0  # seconds
