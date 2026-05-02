"""Worker core implementation using PostgreSQL FOR UPDATE SKIP LOCKED.

This module provides the Worker class for processing tasks concurrently
from a PostgreSQL-based task queue.
"""

import asyncio
import platform
import signal
from typing import Awaitable, Callable, Literal

from loguru import logger

from database import new_session
from services import task_notification_service
from services.task import TaskService, Task, TaskStatus
from worker.handlers.hf.cleanup import cleanup_stale_incomplete_files
from worker.handlers.base import TaskControl, ExecutionResult
from core import settings

_TASK_FETCH_BATCH_SIZE = 1

HandlerFunc = Callable[[Task, TaskControl], Awaitable[ExecutionResult]]
ProfileRecoveryFunc = Callable[..., Awaitable[None]]
StartupRecoveryFunc = Callable[[], Awaitable[None]]


class Worker:
    """Task worker using PostgreSQL FOR UPDATE SKIP LOCKED.

    This worker continuously polls the database for pending tasks
    and processes them concurrently. Multiple workers can run
    simultaneously without conflicts thanks to SKIP LOCKED.

    Each database operation creates its own session via new_session()
    so that the worker never holds a session open across network I/O.
    """

    def __init__(
        self,
        poll_interval: float | None = None,
        max_concurrent: int | None = None,
        cancel_check_interval: float | None = None,
    ):
        """Initialize the worker.

        Args:
            poll_interval: Seconds between polling when no tasks
            max_concurrent: Maximum concurrent tasks to process
            cancel_check_interval: Seconds between checking for cancellation
        """
        self.poll_interval = poll_interval or settings.WORKER_POLL_INTERVAL
        self.max_concurrent = max_concurrent or settings.WORKER_MAX_CONCURRENT
        self.cancel_check_interval = (
            cancel_check_interval or settings.WORKER_CANCEL_CHECK_INTERVAL
        )
        self._handlers: dict[str, HandlerFunc] = {}
        self._profile_recoveries: dict[str, ProfileRecoveryFunc] = {}
        self._startup_recoveries: list[StartupRecoveryFunc] = []
        self._running = False
        self._task_controls: dict[int, TaskControl] = {}

    def register(self, name: str, handler: HandlerFunc | None = None):
        """Register a task handler.

        Can be used as a decorator or called directly:

            @worker.register("download_model")
            async def handle(task, control): ...

            worker.register("download_model", handle)
        """

        def _do_register(h: HandlerFunc) -> HandlerFunc:
            self._handlers[name] = h
            return h

        return _do_register(handler) if handler is not None else _do_register

    def register_profile_recovery(
        self,
        source: str,
        recovery_func: ProfileRecoveryFunc,
        startup_recovery: StartupRecoveryFunc | None = None,
    ) -> None:
        """Register profile recovery functions for a source.

        Args:
            source: Source identifier (e.g. "huggingface", "modelscope")
            recovery_func: Async callable(session, repo_id, repo_type) that
                restores a profile within an existing session.
            startup_recovery: Optional async callable() that scans for and
                recovers all UPDATING profiles for this source at worker start.
        """
        self._profile_recoveries[source] = recovery_func
        if startup_recovery is not None:
            self._startup_recoveries.append(startup_recovery)

    async def start(self) -> None:
        """Start the worker loop."""
        self._running = True
        logger.info("Started, polling every {}s", self.poll_interval)
        logger.info("Max concurrent tasks: {}", self.max_concurrent)
        logger.info("Press Ctrl+C to stop")

        await asyncio.to_thread(cleanup_stale_incomplete_files)

        # Fail orphaned RUNNING tasks from a previous crashed worker.
        # Must run before profile recovery so profiles see no RUNNING tasks.
        await self._recover_orphaned_tasks()

        # Recover profiles stuck in UPDATING from a previous crashed worker
        await self._recover_updating_profiles()

        # Register signal handlers for graceful shutdown
        loop = asyncio.get_running_loop()
        try:
            loop.add_signal_handler(signal.SIGINT, self._signal_handler)
            if platform.system() != "Windows":
                loop.add_signal_handler(signal.SIGTERM, self._signal_handler)
        except NotImplementedError:
            # Windows: fallback to signal.signal (add_signal_handler unsupported)
            signal.signal(signal.SIGINT, lambda s, f: self._signal_handler())
            if platform.system() != "Windows":
                signal.signal(signal.SIGTERM, lambda s, f: self._signal_handler())

        semaphore = asyncio.Semaphore(self.max_concurrent)
        running_tasks: set[asyncio.Task] = set()

        # Single background coroutine for batch status checking
        watch_task = asyncio.create_task(self._watch_running_tasks())

        try:
            while self._running:
                try:
                    await semaphore.acquire()

                    if not self._running:
                        semaphore.release()
                        break

                    async with new_session() as session:
                        task_service = TaskService(session)
                        tasks = await task_service.get_next_task(batch_size=_TASK_FETCH_BATCH_SIZE)
                        await session.commit()

                    if not tasks:
                        semaphore.release()
                        await asyncio.sleep(self.poll_interval)
                        continue

                    task = tasks[0]
                    logger.info("Got task: {}", task.id)

                    t = asyncio.create_task(self._process_task(task))
                    # Semaphore released by done callback below
                    t.add_done_callback(lambda _: semaphore.release())
                    running_tasks.add(t)
                    t.add_done_callback(running_tasks.discard)

                except Exception as e:
                    semaphore.release()
                    logger.exception("Error in task processing: {}", e)
                    await asyncio.sleep(self.poll_interval)
        finally:
            watch_task.cancel()
            try:
                await watch_task
            except asyncio.CancelledError:
                pass

        # Wait for all running tasks to complete cleanup
        if running_tasks:
            logger.info("Waiting for {} task(s) to complete...", len(running_tasks))
            await asyncio.gather(*running_tasks, return_exceptions=True)

        logger.info("Stopped")

    async def _recover_orphaned_tasks(self) -> None:
        """Mark RUNNING tasks as FAILED after a worker crash.

        RUNNING means the previous worker crashed mid-processing. PAUSING
        tasks are left alone — they were paused by user request and can be
        resumed manually.
        """
        async with new_session() as session:
            ts = TaskService(session)
            count = await ts.recover_orphaned_running_tasks()
            await session.commit()
        if count:
            logger.info("Marked {} orphaned RUNNING task(s) as FAILED", count)

    async def _recover_updating_profiles(self) -> None:
        """Recover profiles stuck in UPDATING after a worker crash.

        Delegates to each source's registered startup recovery function.
        """
        for recovery_func in self._startup_recoveries:
            try:
                await recovery_func()
            except Exception as e:
                logger.warning("Error during startup profile recovery: {}", e)

    def stop(self) -> None:
        """Stop the worker gracefully."""
        self._running = False
        # Signal all running tasks to cancel
        for tc in self._task_controls.values():
            tc.cancel_event.set()
        logger.info("Signalled {} task(s) to cancel", len(self._task_controls))

    def _signal_handler(self) -> None:
        """Handle shutdown signals."""
        logger.info("Shutting down...")
        self.stop()

    async def _send_notification(
        self,
        task: Task,
        status: Literal["completed", "failed", "cancelled", "paused"],
        error: str | None = None,
    ) -> None:
        """Send a task notification, logging but never raising on failure."""
        try:
            await task_notification_service.send_task_notification(task, status, error)
        except Exception:
            logger.warning("Failed to send {} notification", status)

    async def _restore_profile_in_session(
        self, session, repo_id: str, repo_type: str, source: str
    ) -> None:
        """Restore profile status within an existing session.

        Delegates to the source-specific recovery function registered
        for the given source.
        """
        recovery_func = self._profile_recoveries.get(source)
        if recovery_func is None:
            logger.debug(
                "No profile recovery registered for source '{}', skipping", source
            )
            return
        await recovery_func(session, repo_id, repo_type)

    async def _maybe_retry_task(self, task: Task, error: Exception) -> bool:
        """Retry a failed task if the error is transient and retries remain.

        Returns True if the task was requeued, False if it should be failed.
        """
        if not self._is_retryable_error(error):
            return False

        retry_count = task.retry_count
        if retry_count >= settings.WORKER_MAX_RETRIES:
            logger.info(
                "Task {} reached max retries ({}/{}) — failing permanently",
                task.id,
                retry_count,
                settings.WORKER_MAX_RETRIES,
            )
            return False

        delay = min(
            settings.WORKER_RETRY_BASE_DELAY * (2**retry_count),
            settings.WORKER_RETRY_MAX_DELAY,
        )
        logger.info(
            "Retrying task {} in {:.0f}s (attempt {}/{})",
            task.id,
            delay,
            retry_count + 1,
            settings.WORKER_MAX_RETRIES,
        )

        try:
            async with new_session() as session:
                ts = TaskService(session)
                await ts.increment_retry_count(task.id)
                await ts.requeue_task(task.id)
                await self._restore_profile_in_session(
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

    @staticmethod
    def _is_retryable_error(error: Exception) -> bool:
        """Check if an error is likely transient and worth retrying."""
        import httpx

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

    async def _with_task_session(
        self, task: Task, action, *, restore_profile: bool = False
    ) -> None:
        """Execute a task status update within a new session and commit."""
        async with new_session() as session:
            ts = TaskService(session)
            await action(ts)
            if restore_profile:
                await self._restore_profile_in_session(
                    session, task.repo_id, task.repo_type, task.source
                )
            await session.commit()

    async def _process_task(
        self,
        task: Task,
    ) -> None:
        """Process a single task with cancellation support.

        The handler returns an ExecutionResult after performing all
        internal cleanup. This method translates the result into the
        final database task status.
        """
        handler_name = f"download_{task.source}"
        handler = self._handlers.get(handler_name)

        if not handler:
            await self._with_task_session(
                task,
                lambda ts: ts.fail(task.id, f"No handler for source: {task.source}"),
            )
            return

        task_control = TaskControl()
        self._task_controls[task.id] = task_control

        try:
            logger.info(
                "Processing task {}: {} ({})", task.id, task.repo_id, task.source
            )
            result = await handler(task, task_control)

            if result.status == "completed":
                if task_control.cancel_event.is_set():
                    await self._with_task_session(task, lambda ts: ts.cancel(task.id))
                    logger.info("Task {} cancelled by user", task.id)
                    await self._send_notification(task, "cancelled")
                elif task_control.pause_event.is_set():
                    await self._with_task_session(task, lambda ts: ts.complete(task.id))
                    logger.info(
                        "Task {} completed (pause request arrived after all work finished)",
                        task.id,
                    )
                    await self._send_notification(task, "completed")
                else:
                    await self._with_task_session(task, lambda ts: ts.complete(task.id))
                    logger.info("Completed task {}", task.id)
                    await self._send_notification(task, "completed")

            elif result.status == "cancelled":
                await self._with_task_session(task, lambda ts: ts.cancel(task.id))
                logger.info("Task {} cancelled by user", task.id)
                await self._send_notification(task, "cancelled")

            elif result.status == "paused":
                await self._with_task_session(task, lambda ts: ts.pause(task.id))
                logger.info("Task {} paused by user", task.id)

            elif result.status == "failed":
                logger.error("Failed task {}: {}", task.id, result.error)
                if result.exception and await self._maybe_retry_task(
                    task, result.exception
                ):
                    return
                try:
                    await self._with_task_session(
                        task,
                        lambda ts: ts.fail(task.id, result.error or "Unknown error"),
                    )
                except Exception as fail_error:
                    logger.error(
                        "Critical: Failed to update task {} status to FAILED: {}",
                        task.id,
                        fail_error,
                    )
                await self._send_notification(task, "failed", result.error)

        except Exception as e:
            logger.exception("Unexpected error processing task {}: {}", task.id, e)
            error_msg = str(e)
            try:
                await self._with_task_session(
                    task, lambda ts: ts.fail(task.id, error_msg)
                )
            except Exception as fail_error:
                logger.error(
                    "Critical: Failed to update task {} status to FAILED: {}",
                    task.id,
                    fail_error,
                )
            await self._send_notification(task, "failed", error_msg)
        finally:
            self._task_controls.pop(task.id, None)

    async def _watch_running_tasks(self) -> None:
        """Single coroutine that batch-checks all running tasks for cancel/pause.

        Replaces the old per-task watch pattern. Queries the database once
        per cycle for all currently-running task IDs, looking for any that
        have transitioned to CANCELING or PAUSING.
        """
        while self._running:
            try:
                await asyncio.sleep(self.cancel_check_interval)

                if not self._task_controls:
                    continue

                running_ids = list(self._task_controls.keys())
                async with new_session() as session:
                    ts = TaskService(session)
                    matches = await ts.get_tasks_with_status(
                        running_ids,
                        [TaskStatus.CANCELING, TaskStatus.PAUSING],
                    )

                for task_id, status in matches:
                    control = self._task_controls.get(task_id)
                    if control is None:
                        continue
                    if status == TaskStatus.CANCELING:
                        logger.info(
                            "Detected cancellation request for task {}", task_id
                        )
                        control.cancel_event.set()
                    elif status == TaskStatus.PAUSING:
                        logger.info("Detected pause request for task {}", task_id)
                        control.pause_event.set()

            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.warning("Error in batch watch: {}", e)
