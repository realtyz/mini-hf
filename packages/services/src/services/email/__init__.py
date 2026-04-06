"""Email services for mini-hf.

This module provides email functionality including SMTP client,
verification code service, and task notification service.

Example:
    from services.email import SMTPConfig, EmailClient

    # Simple email
    config = SMTPConfig(host="smtp.example.com", username="user", password="pass")
    client = EmailClient(config)
    await client.send_email("to@example.com", "Subject", "Body")

    # Template email
    client = EmailClient(config, template_dir="/path/to/templates")
    await client.send_template_email(
        to="to@example.com",
        subject="Welcome",
        template_name="welcome.html",
        context={"name": "John"}
    )

    # Verification code service
    from services.email import verify_code_service
    success, message, retry_after = await verify_code_service.send_code("user@example.com")

    # Task notification service
    from services.email import task_notification_service
    await task_notification_service.send_task_notification(task, "completed")
"""

from .client import EmailClient
from .config import SMTPConfig
from .exceptions import (
    ConfigurationError,
    EmailError,
    EmailSendError,
    SMTPAuthenticationError,
    SMTPConnectionError,
    TemplateError,
)
from .services import (
    TaskNotificationService,
    VerifyCodeService,
    task_notification_service,
    verify_code_service,
)

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
]
