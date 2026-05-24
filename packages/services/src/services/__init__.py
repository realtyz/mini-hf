"""Services package for mini-hf.

This package provides shared services including email functionality.

Example:
    from services import EmailClient, SMTPConfig, ConfigService
"""

from services.email import (
    ConfigurationError,
    EmailClient,
    EmailError,
    EmailSendError,
    SMTPAuthenticationError,
    SMTPConnectionError,
    TaskNotificationService,
    TemplateError,
    VerifyCodeService,
)
from services.config import ConfigService, SMTPConfig

__all__ = [
    "EmailClient",
    "SMTPConfig",
    "EmailError",
    "ConfigurationError",
    "EmailSendError",
    "SMTPAuthenticationError",
    "SMTPConnectionError",
    "TemplateError",
    "VerifyCodeService",
    "TaskNotificationService",
    "ConfigService",
]
