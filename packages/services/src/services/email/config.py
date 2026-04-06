"""SMTP configuration for email client."""

from dataclasses import dataclass


@dataclass
class SMTPConfig:
    """SMTP configuration for email client.

    Attributes:
        host: SMTP server hostname
        port: SMTP server port (default: 587 for TLS)
        username: SMTP authentication username
        password: SMTP authentication password
        use_tls: Whether to use TLS encryption (STARTTLS)
        from_email: Default sender email address
    """

    host: str = ""
    port: int = 587
    username: str = ""
    password: str = ""
    use_tls: bool = True
    from_email: str = ""

    @property
    def is_configured(self) -> bool:
        """Check if SMTP is properly configured.

        Returns:
            True if host, username, and password are all provided.
        """
        return bool(self.host and self.username and self.password)
