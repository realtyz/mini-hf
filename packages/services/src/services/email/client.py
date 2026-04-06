"""Async email client with SMTP and template support."""

import asyncio
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from pathlib import Path
from typing import Any

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, select_autoescape
from loguru import logger

from .config import SMTPConfig
from .exceptions import (
    ConfigurationError,
    EmailSendError,
    SMTPAuthenticationError,
    SMTPConnectionError,
    TemplateError,
)


class EmailClient:
    """Async email client using SMTP with Jinja2 template support.

    Example:
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

    def __init__(
        self,
        config: SMTPConfig,
        template_dir: Path | str | None = None,
    ):
        """Initialize email client.

        Args:
            config: SMTP configuration
            template_dir: Optional directory containing Jinja2 templates
        """
        self._config = config
        self._template_env: Environment | None = None

        if template_dir:
            template_path = Path(template_dir)
            self._template_env = Environment(
                loader=FileSystemLoader(template_path),
                autoescape=select_autoescape(["html", "xml"]),
            )

    def _validate_config(self) -> None:
        """Validate SMTP configuration.

        Raises:
            ConfigurationError: If configuration is invalid
        """
        if not self._config.is_configured:
            raise ConfigurationError(
                "SMTP is not configured. Please provide host, username, and password."
            )

    def render_template(self, template_name: str, context: dict[str, Any]) -> str:
        """Render a template with context.

        Args:
            template_name: Name of the template file (e.g., "welcome.html")
            context: Dictionary of variables to pass to the template

        Returns:
            Rendered template string

        Raises:
            TemplateError: If template rendering fails
        """
        if not self._template_env:
            raise TemplateError(
                "Template environment not configured. "
                "Initialize EmailClient with template_dir parameter."
            )

        try:
            template = self._template_env.get_template(template_name)
            return template.render(**context)
        except Exception as e:
            raise TemplateError(
                f"Failed to render template '{template_name}': {e}"
            ) from e

    async def send_email(
        self,
        to: str | list[str],
        subject: str,
        body: str,
        html: bool = False,
        cc: list[str] | None = None,
        bcc: list[str] | None = None,
        reply_to: str | None = None,
        attachments: list[dict[str, Any]] | None = None,
        from_email: str | None = None,
    ) -> bool:
        """Send an email.

        Args:
            to: Recipient email address(es)
            subject: Email subject
            body: Email body content
            html: Whether the body is HTML content
            cc: CC recipients
            bcc: BCC recipients
            reply_to: Reply-to address
            attachments: List of attachments, each with 'filename', 'content', and
                        optional 'content_type'
            from_email: Override sender email address

        Returns:
            True if email was sent successfully

        Raises:
            ConfigurationError: If SMTP is not configured
            SMTPConnectionError: If connection to SMTP server fails
            SMTPAuthenticationError: If SMTP authentication fails
            EmailSendError: If sending email fails
        """
        self._validate_config()

        # Prepare recipients
        recipients: list[str] = []
        if isinstance(to, str):
            recipients.append(to)
        else:
            recipients.extend(to)

        if cc:
            recipients.extend(cc)
        if bcc:
            recipients.extend(bcc)

        # Create message
        msg = MIMEMultipart("alternative" if html and attachments else "mixed")
        msg["Subject"] = subject
        msg["From"] = from_email or self._config.from_email or self._config.username
        msg["To"] = ", ".join([to] if isinstance(to, str) else to)

        if cc:
            msg["Cc"] = ", ".join(cc)
        if reply_to:
            msg["Reply-To"] = reply_to

        # Add body
        if html:
            msg.attach(MIMEText(body, "html", "utf-8"))
            # Also add plain text version for better compatibility
            # msg.attach(MIMEText(plain_text_body, "plain", "utf-8"))
        else:
            msg.attach(MIMEText(body, "plain", "utf-8"))

        # Add attachments
        if attachments:
            for attachment in attachments:
                part = MIMEBase("application", "octet-stream")
                part.set_payload(attachment["content"])
                encoders.encode_base64(part)
                part.add_header(
                    "Content-Disposition",
                    f'attachment; filename="{attachment["filename"]}"',
                )
                if "content_type" in attachment:
                    part.set_type(attachment["content_type"])
                msg.attach(part)

        try:
            # For port 465 (SMTPS), use direct TLS; for 587, use STARTTLS
            if self._config.port == 465:
                await aiosmtplib.send(
                    msg,
                    hostname=self._config.host,
                    port=self._config.port,
                    username=self._config.username,
                    password=self._config.password,
                    use_tls=True,
                )
            else:
                await aiosmtplib.send(
                    msg,
                    hostname=self._config.host,
                    port=self._config.port,
                    username=self._config.username,
                    password=self._config.password,
                    start_tls=self._config.use_tls,
                )
            return True
        except aiosmtplib.SMTPAuthenticationError as e:
            raise SMTPAuthenticationError(f"SMTP authentication failed: {e}") from e
        except aiosmtplib.SMTPConnectError as e:
            raise SMTPConnectionError(f"Failed to connect to SMTP server: {e}") from e
        except aiosmtplib.SMTPException as e:
            raise EmailSendError(f"Failed to send email: {e}") from e

    async def send_template_email(
        self,
        to: str | list[str],
        subject: str,
        template_name: str,
        context: dict[str, Any],
        cc: list[str] | None = None,
        bcc: list[str] | None = None,
        reply_to: str | None = None,
        from_email: str | None = None,
    ) -> bool:
        """Send email using a Jinja2 template.

        The template can be:
        - A single .html or .txt file
        - If both .html and .txt versions exist (e.g., welcome.html and welcome.txt),
          sends a multipart email with both versions

        Args:
            to: Recipient email address(es)
            subject: Email subject
            template_name: Name of the template file (with or without extension)
            context: Dictionary of variables to pass to the template
            cc: CC recipients
            bcc: BCC recipients
            reply_to: Reply-to address
            from_email: Override sender email address

        Returns:
            True if email was sent successfully

        Raises:
            TemplateError: If template rendering fails
            ConfigurationError: If SMTP is not configured
            EmailSendError: If sending email fails
        """
        if not self._template_env:
            raise TemplateError(
                "Template environment not configured. "
                "Initialize EmailClient with template_dir parameter."
            )

        # Determine template type and render
        template_base = Path(template_name).stem

        # Try to find template file
        html_body: str | None = None
        text_body: str | None = None

        # Check for .html template
        html_template = f"{template_base}.html"
        try:
            html_body = self.render_template(html_template, context)
        except TemplateError:
            pass

        # Check for .txt template
        txt_template = f"{template_base}.txt"
        try:
            text_body = self.render_template(txt_template, context)
        except TemplateError:
            pass

        # If neither found, try the original template name
        if not html_body and not text_body:
            try:
                body = self.render_template(template_name, context)
                # Determine if it's HTML based on extension
                if template_name.endswith(".html"):
                    html_body = body
                else:
                    text_body = body
            except TemplateError as e:
                raise TemplateError(f"No template found for '{template_name}'") from e

        # Create multipart message
        self._validate_config()

        recipients: list[str] = []
        if isinstance(to, str):
            recipients.append(to)
        else:
            recipients.extend(to)

        if cc:
            recipients.extend(cc)
        if bcc:
            recipients.extend(bcc)

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_email or self._config.from_email or self._config.username
        msg["To"] = ", ".join([to] if isinstance(to, str) else to)

        if cc:
            msg["Cc"] = ", ".join(cc)
        if reply_to:
            msg["Reply-To"] = reply_to

        # Add both versions if available (text first, then html - mail clients prefer the last)
        if text_body:
            msg.attach(MIMEText(text_body, "plain", "utf-8"))
        if html_body:
            msg.attach(MIMEText(html_body, "html", "utf-8"))

        try:
            # For port 465 (SMTPS), use direct TLS; for 587, use STARTTLS
            if self._config.port == 465:
                await aiosmtplib.send(
                    msg,
                    hostname=self._config.host,
                    port=self._config.port,
                    username=self._config.username,
                    password=self._config.password,
                    use_tls=True,
                )
            else:
                await aiosmtplib.send(
                    msg,
                    hostname=self._config.host,
                    port=self._config.port,
                    username=self._config.username,
                    password=self._config.password,
                    start_tls=self._config.use_tls,
                )
            return True
        except aiosmtplib.SMTPAuthenticationError as e:
            raise SMTPAuthenticationError(f"SMTP authentication failed: {e}") from e
        except aiosmtplib.SMTPConnectError as e:
            raise SMTPConnectionError(f"Failed to connect to SMTP server: {e}") from e
        except aiosmtplib.SMTPException as e:
            raise EmailSendError(f"Failed to send email: {e}") from e

    async def test_connection(self) -> tuple[bool, str]:
        """Test SMTP connection.

        Returns:
            Tuple of (success, message) where message describes the result
        """
        if not self._config.is_configured:
            return False, "SMTP is not configured (missing host, username, or password)"

        logger.info(
            f"[SMTP Test] Starting connection test to {self._config.host}:{self._config.port}"
        )
        logger.debug(
            f"[SMTP Test] Username: {self._config.username}, TLS: {self._config.use_tls}"
        )

        step = "initializing"
        try:
            # Step 1: Create SMTP client
            step = "creating SMTP client"
            logger.info("[SMTP Test] Step 1: Creating SMTP client...")
            smtp = aiosmtplib.SMTP(
                hostname=self._config.host,
                port=self._config.port,
                timeout=10,
                use_tls=self._config.use_tls,
            )

            # Step 2: Connect (TLS is already handled by use_tls parameter)
            step = "connecting"
            logger.info(
                f"[SMTP Test] Step 2: Connecting to {self._config.host}:{self._config.port} (TLS={self._config.use_tls})..."
            )
            await asyncio.wait_for(smtp.connect(), timeout=15)
            logger.info("[SMTP Test] ✓ Connection established")

            # Step 3: Login
            step = "authenticating"
            logger.info(
                f"[SMTP Test] Step 3: Authenticating as {self._config.username}..."
            )
            await smtp.login(self._config.username, self._config.password)
            logger.info("[SMTP Test] ✓ Authentication successful")

            # Step 4: Disconnect
            step = "disconnecting"
            await smtp.quit()
            logger.info("[SMTP Test] ✓ Connection test passed")

            return (
                True,
                f"Successfully connected to {self._config.host}:{self._config.port}",
            )

        except asyncio.TimeoutError:
            logger.error(f"[SMTP Test] ⏱️ Connection timed out at step: {step}")
            return False, f"Connection timed out at step: {step}"
        except aiosmtplib.SMTPAuthenticationError as e:
            logger.error(f"[SMTP Test] ❌ Authentication failed: {e}")
            return False, f"Authentication failed: {e}"
        except aiosmtplib.SMTPConnectError as e:
            logger.error(f"[SMTP Test] ❌ Connection failed: {e}")
            return False, f"Connection failed: {e}"
        except Exception as e:
            logger.opt(exception=True).error(
                f"[SMTP Test] ❌ Unexpected error at step '{step}': {e}"
            )
            return False, f"Connection test failed at step '{step}': {type(e).__name__}: {e}"
