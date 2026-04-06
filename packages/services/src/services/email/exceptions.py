"""Custom exceptions for email client."""


class EmailError(Exception):
    """Base exception for email-related errors."""

    pass


class SMTPConnectionError(EmailError):
    """Exception raised when SMTP connection fails."""

    pass


class SMTPAuthenticationError(EmailError):
    """Exception raised when SMTP authentication fails."""

    pass


class EmailSendError(EmailError):
    """Exception raised when sending email fails."""

    pass


class TemplateError(EmailError):
    """Exception raised when template rendering fails."""

    pass


class ConfigurationError(EmailError):
    """Exception raised when SMTP configuration is invalid."""

    pass
