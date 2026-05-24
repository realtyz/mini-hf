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
"""

from .client import EmailClient
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
)

__all__ = [
    "EmailClient",
    "EmailError",
    "ConfigurationError",
    "EmailSendError",
    "SMTPAuthenticationError",
    "SMTPConnectionError",
    "TemplateError",
    "VerifyCodeService",
    "TaskNotificationService",
]
