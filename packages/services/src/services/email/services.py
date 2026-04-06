"""High-level email services for mini-hf.

This module provides business-level email services that integrate
with the database and cache systems.
"""

import random
import string
import time
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Literal

from loguru import logger

from .client import EmailClient
from .config import SMTPConfig
from .exceptions import EmailError

if TYPE_CHECKING:
    from task import Task

# Template directory (builtin templates)
# Path: services/email/services.py -> services/email/ -> services/ -> src/ -> services/ -> templates/
TEMPLATE_DIR = Path(__file__).parent.parent.parent.parent / "templates"


class VerifyCodeService:
    """Verification code email service.

    This service handles sending and verifying email verification codes.
    Codes are stored in Redis cache with a TTL.

    Example:
        from services import verify_code_service

        # Send verification code
        success, message, retry_after = await verify_code_service.send_code("user@example.com")

        # Verify code
        success, message = await verify_code_service.verify_code("user@example.com", "123456")
    """

    KEY_PREFIX = "email_verify:"
    CODE_LENGTH = 6
    CODE_TTL = 300  # 5 minutes
    RESEND_INTERVAL = 60  # seconds

    def _get_key(self, email: str) -> str:
        """Build Redis key for email."""
        return f"{self.KEY_PREFIX}{email.lower()}"

    def _generate_code(self) -> str:
        """Generate random verification code."""
        return "".join(random.choices(string.digits, k=self.CODE_LENGTH))

    async def _get_smtp_config(self) -> SMTPConfig | None:
        """Read SMTP configuration from database.

        Returns:
            SMTPConfig instance if configured, None otherwise
        """
        try:
            from database import get_session
            from services.config import ConfigService

            async with get_session() as session:
                config_service = ConfigService(session)
                smtp_config = await config_service.get_smtp_config()
                return smtp_config if smtp_config.is_configured else None
        except Exception as e:
            logger.error("Failed to read SMTP config from database: {}", e)
            return None

    async def _get_stored_data(self, email: str) -> dict | None:
        """Get stored verification code data from cache."""
        from cache import cache_service

        key = self._get_key(email)
        data = await cache_service.get(key)
        return data

    async def can_send(self, email: str) -> tuple[bool, int]:
        """Check if verification code can be sent.

        Args:
            email: Email address

        Returns:
            Tuple of (can_send, remaining_wait_seconds)
        """
        data = await self._get_stored_data(email)
        if not data:
            return True, 0

        created_at = data.get("created_at", 0)
        elapsed = time.time() - created_at
        remaining = max(0, self.RESEND_INTERVAL - int(elapsed))

        return remaining == 0, remaining

    async def send_code(self, email: str) -> tuple[bool, str, int]:
        """Send verification code to email.

        Args:
            email: Email address to send code to

        Returns:
            Tuple of (success, message, retry_after_seconds)
        """
        # Check if can send
        can_send, remaining = await self.can_send(email)
        if not can_send:
            return False, f"请等待 {remaining} 秒后再试", remaining

        # Generate code
        code = self._generate_code()

        # Store code in cache
        from cache import cache_service

        key = self._get_key(email)
        data = {
            "code": code,
            "created_at": time.time(),
        }
        await cache_service.set(key, data, ttl=self.CODE_TTL)

        # Send email
        try:
            config = await self._get_smtp_config()
            if not config or not config.is_configured:
                logger.warning(
                    "SMTP not configured, skipping email send. "
                    f"Verification code for {email}: {code}"
                )
                return (
                    True,
                    "验证码已发送（邮件服务未配置，请查看日志）",
                    self.RESEND_INTERVAL,
                )

            client = EmailClient(config, template_dir=TEMPLATE_DIR)
            await client.send_template_email(
                to=email,
                subject="mini-hf 邮箱验证码",
                template_name="verify_code.html",
                context={"code": code, "year": datetime.now().year},
            )
            logger.info(f"Verification code sent to {email}")
            return True, "验证码已发送", self.RESEND_INTERVAL

        except EmailError as e:
            logger.error(f"Failed to send verification code to {email}: {e}")
            return False, f"发送失败: {e}", 0

    async def verify_code(
        self, email: str, code: str, delete_on_success: bool = True
    ) -> tuple[bool, str]:
        """Verify the verification code.

        Args:
            email: Email address
            code: Verification code to verify
            delete_on_success: Whether to delete the code after successful verification

        Returns:
            Tuple of (success, message)
        """
        from cache import cache_service

        key = self._get_key(email)
        data = await self._get_stored_data(email)

        if not data:
            return False, "验证码已过期或不存在"

        stored_code = data.get("code")
        if stored_code != code:
            return False, "验证码错误"

        # Verification successful, delete code if requested
        if delete_on_success:
            await cache_service.delete(key)
        logger.info(f"Verification code verified for {email}")
        return True, "验证成功"


class TaskNotificationService:
    """Task status notification email service.

    This service sends email notifications when tasks complete, fail,
    or are cancelled.

    Example:
        from services import task_notification_service

        # Send completion notification
        await task_notification_service.send_task_notification(task, "completed")

        # Send failure notification
        await task_notification_service.send_task_notification(task, "failed", "Error message")
    """

    async def _get_smtp_config(self) -> SMTPConfig | None:
        """Read SMTP configuration from database.

        Returns:
            SMTPConfig instance if configured, None otherwise
        """
        try:
            from database import get_session
            from services.config import ConfigService

            async with get_session() as session:
                config_service = ConfigService(session)
                smtp_config = await config_service.get_smtp_config()
                return smtp_config if smtp_config.is_configured else None
        except Exception as e:
            logger.error("Failed to read SMTP config from database: {}", e)
            return None

    async def _get_user_email(self, user_id: int) -> str | None:
        """Get user email by user ID.

        Args:
            user_id: User ID to look up

        Returns:
            User email if found, None otherwise
        """
        try:
            from database import UserRepository, get_session

            async with get_session() as session:
                repo = UserRepository(session)
                user = await repo.get_by_id(user_id)
                return user.email if user else None
        except Exception as e:
            logger.error(f"Failed to get user email for user {user_id}: {e}")
            return None

    async def send_task_notification(
        self,
        task: "Task",
        status: Literal["completed", "failed", "cancelled"],
        error_message: str | None = None,
    ) -> bool:
        """Send task status notification email to the task creator.

        Args:
            task: Task instance with creator information
            status: Task status ("completed", "failed", or "cancelled")
            error_message: Optional error message for failed tasks

        Returns:
            True if email was sent successfully, False otherwise
        """
        try:
            # 1. Check if SMTP is configured
            config = await self._get_smtp_config()
            if not config or not config.is_configured:
                logger.debug("SMTP not configured, skipping email notification")
                return False

            # 2. Get creator email
            email = await self._get_user_email(task.creator_user_id)
            if not email:
                logger.warning(
                    f"User email not found for task {task.id}, user {task.creator_user_id}"
                )
                return False

            # 3. Create email client with template directory
            client = EmailClient(config, template_dir=TEMPLATE_DIR)

            # 4. Render template and send email
            template_name = f"task_{status}.html"
            subject = self._get_subject(task, status)
            context = {"task": task, "error_message": error_message}

            await client.send_template_email(
                to=email,
                subject=subject,
                template_name=template_name,
                context=context,
            )

            logger.info(
                f"Sent {status} notification email for task {task.id} to {email}"
            )
            return True

        except Exception as e:
            # Don't let email failure affect task status
            logger.error(f"Failed to send email notification for task {task.id}: {e}")
            return False

    def _get_subject(self, task: "Task", status: str) -> str:
        """Generate email subject line.

        Args:
            task: Task instance
            status: Task status

        Returns:
            Formatted subject line
        """
        status_text = {
            "completed": "已完成",
            "failed": "失败",
            "cancelled": "已取消",
        }
        return f"[Mini-HF] 任务 {task.repo_id} {status_text.get(status, status)}"

    async def send_task_approval_notification(
        self,
        task: "Task",
        notification_emails: str,
    ) -> bool:
        """Send task approval notification email to admin emails.

        This is sent when a task is created and requires admin approval.

        Args:
            task: Task instance awaiting approval
            notification_emails: Comma-separated list of email addresses

        Returns:
            True if email was sent successfully, False otherwise
        """
        try:
            # 1. Check if SMTP is configured
            config = await self._get_smtp_config()
            if not config or not config.is_configured:
                logger.debug(
                    "SMTP not configured, skipping approval email notification"
                )
                return False

            # 2. Parse notification emails
            emails = [e.strip() for e in notification_emails.split(",") if e.strip()]
            if not emails:
                logger.debug(
                    "No notification emails configured, skipping approval email"
                )
                return False

            # 3. Create email client with template directory
            client = EmailClient(config, template_dir=TEMPLATE_DIR)

            # 4. Format storage size for display
            required_storage_gb = task.required_storage / (1024**3)
            total_storage_gb = task.total_storage / (1024**3)

            # 5. Render template and send email
            context = {
                "task": task,
                "required_storage_gb": round(required_storage_gb, 2),
                "total_storage_gb": round(total_storage_gb, 2),
            }

            await client.send_template_email(
                to=emails,
                subject=f"[Mini-HF] 新任务待审批: {task.repo_id}",
                template_name="task_pending_approval.html",
                context=context,
            )

            logger.info(
                f"Sent approval notification email for task {task.id} to {emails}"
            )
            return True

        except Exception as e:
            # Don't let email failure affect task creation
            logger.error(
                f"Failed to send approval email notification for task {task.id}: {e}"
            )
            return False


# Singleton instances
verify_code_service = VerifyCodeService()
task_notification_service = TaskNotificationService()
