"""Worker core implementation using PostgreSQL FOR UPDATE SKIP LOCKED.

This module provides the Worker class for processing tasks concurrently
from a PostgreSQL-based task queue.
"""

import asyncio
import platform
import signal
from typing import Awaitable, Callable, Literal

from loguru import logger

from core import settings
from database import new_session
from services import TaskNotificationService
from services.config import ConfigService
from services.task import TaskService, Task
from worker.handlers.contracts import HandlerFunc, TaskControl
from worker.retry import RetryPolicy
from worker.watchdog import TaskWatchdog
from worker.recovery import StartupRecovery, StartupRecoveryFunc

_TASK_FETCH_BATCH_SIZE = 1

ProfileRecoveryFunc = Callable[..., Awaitable[None]]


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
        self._retry_policy = RetryPolicy()

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

        # Startup recovery: stale files, orphaned tasks, stuck profiles
        recovery = StartupRecovery(self._startup_recoveries)
        await recovery.recover()

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

        # Background coroutine for batch status checking
        watchdog = TaskWatchdog(self._task_controls, self.cancel_check_interval)
        watch_task = watchdog.start()

        try:
            while self._running:
                task_created = False
                try:
                    await semaphore.acquire()

                    if not self._running:
                        semaphore.release()
                        break

                    async with new_session() as session:
                        task_service = TaskService(session)
                        tasks = await task_service.get_next_task(
                            batch_size=_TASK_FETCH_BATCH_SIZE
                        )
                        await session.commit()

                    if not tasks:
                        semaphore.release()
                        await asyncio.sleep(self.poll_interval)
                        continue

                    task = tasks[0]
                    logger.info("Got task: {}", task.id)

                    t = asyncio.create_task(self._process_task(task))
                    task_created = True
                    # Semaphore released by done callback below
                    t.add_done_callback(lambda _: semaphore.release())
                    running_tasks.add(t)
                    t.add_done_callback(running_tasks.discard)

                except Exception as e:
                    if not task_created:
                        semaphore.release()
                    logger.exception("Error in task processing: {}", e)
                    await asyncio.sleep(self.poll_interval)
        finally:
            watchdog.stop()
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
            async with new_session() as session:
                config_service = ConfigService(session)
                notification = TaskNotificationService(config_service, session)
                await notification.send_task_notification(task, status, error)
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
                if result.exception and await self._retry_policy.maybe_retry(
                    task, result.exception, self._restore_profile_in_session
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
