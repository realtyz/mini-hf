"""Retry policy for failed tasks."""

import asyncio
from typing import Callable, Awaitable

import httpx
from loguru import logger

from core import settings
from database import new_session
from services.task import Task, TaskService


class RetryPolicy:
    """Decides whether and how to retry a failed task.

    Separates retry decision logic (is this error transient?) from
    retry action (requeue to database, wait, restore profile).
    """

    def __init__(
        self,
        max_retries: int | None = None,
        base_delay: float | None = None,
        max_delay: float | None = None,
    ):
        self._max_retries = max_retries or settings.WORKER_MAX_RETRIES
        self._base_delay = base_delay or settings.WORKER_RETRY_BASE_DELAY
        self._max_delay = max_delay or settings.WORKER_RETRY_MAX_DELAY

    @staticmethod
    def is_retryable_error(error: Exception) -> bool:
        """Check if an error is likely transient and worth retrying."""

        retryable_types = (
            httpx.ConnectError,
            httpx.ReadError,
            httpx.WriteError,
            httpx.TimeoutException,
            httpx.NetworkError,
            httpx.RemoteProtocolError,
            ConnectionError,
            TimeoutError,
        )
        if isinstance(error, retryable_types):
            return True

        # Check chained exceptions
        cause = error.__cause__
        while cause is not None:
            if isinstance(cause, retryable_types):
                return True
            cause = cause.__cause__

        return False

    async def maybe_retry(
        self,
        task: Task,
        error: Exception,
        restore_profile: Callable[..., Awaitable[None]],
    ) -> bool:
        """Retry a failed task if the error is transient and retries remain.

        Args:
            task: The failed task.
            error: The exception that caused the failure.
            restore_profile: Callback(session, repo_id, repo_type, source)
                to restore the profile status within the requeue session.

        Returns:
            True if the task was requeued, False if it should be failed.
        """
        if not self.is_retryable_error(error):
            return False

        retry_count = task.retry_count
        if retry_count >= self._max_retries:
            logger.info(
                "Task {} reached max retries ({}/{}) — failing permanently",
                task.id,
                retry_count,
                self._max_retries,
            )
            return False

        delay = min(
            self._base_delay * (2**retry_count),
            self._max_delay,
        )
        logger.info(
            "Retrying task {} in {:.0f}s (attempt {}/{})",
            task.id,
            delay,
            retry_count + 1,
            self._max_retries,
        )

        try:
            async with new_session() as session:
                ts = TaskService(session)
                await ts.increment_retry_count(task.id)
                await ts.requeue_task(task.id)
                await restore_profile(
                    session, task.repo_id, task.repo_type, task.source
                )
                await session.commit()
        except Exception as retry_error:
            logger.error(
                "Failed to requeue task {} for retry: {}", task.id, retry_error
            )
            return False

        await asyncio.sleep(delay)
        return True
