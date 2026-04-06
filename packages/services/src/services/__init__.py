"""Services package for mini-hf.

This package provides shared services including email functionality.

Example:
    from services import EmailClient, SMTPConfig, verify_code_service, ConfigService
"""

from services.email import (
    ConfigurationError,
    EmailClient,
    EmailError,
    EmailSendError,
    SMTPAuthenticationError,
    SMTPConnectionError,
    SMTPConfig,
    TaskNotificationService,
    TemplateError,
    VerifyCodeService,
    task_notification_service,
    verify_code_service,
)
from services.config import ConfigService

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
    "verify_code_service",
    "task_notification_service",
    "ConfigService",
]
