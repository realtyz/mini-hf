"""Worker core implementation using PostgreSQL FOR UPDATE SKIP LOCKED.

This module provides the Worker class for processing tasks concurrently
from a PostgreSQL-based task queue.
"""

import asyncio
import platform
import signal
from typing import Awaitable, Callable, Literal

from loguru import logger

from database import new_session, RepoStatus
from database.db_repositories import HfRepoProfileRepository, HfRepoSnapshotRepository
from services import task_notification_service
from services.task import TaskService, Task, TaskStatus
from worker.handlers.hf.cleanup import cleanup_stale_incomplete_files
from worker.handlers.exceptions import TaskCancelledError, TaskPausedError
from worker.handlers.base import TaskControl
from core import settings

HandlerFunc = Callable[[Task, TaskControl], Awaitable[None]]


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

    async def start(self) -> None:
        """Start the worker loop."""
        self._running = True
        logger.info("Started, polling every {}s", self.poll_interval)
        logger.info("Max concurrent tasks: {}", self.max_concurrent)
        logger.info("Press Ctrl+C to stop")

        await asyncio.to_thread(cleanup_stale_incomplete_files)

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
                        tasks = await task_service.get_next_task(batch_size=1)
                        await session.commit()

                    if not tasks:
                        semaphore.release()
                        await asyncio.sleep(self.poll_interval)
                        continue

                    task = tasks[0]
                    logger.info("Got task: {}", task.id)

                    t = asyncio.create_task(self._run_task(task))
                    # Semaphore is released when the task completes (success or failure)
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

    async def _recover_updating_profiles(self) -> None:
        """Recover profiles stuck in UPDATING after a worker crash.

        Scans all UPDATING profiles and restores them to ACTIVE (if an
        active snapshot exists) or INACTIVE, provided no RUNNING task is
        currently processing the repo.
        """
        async with new_session() as session:
            profile_repo = HfRepoProfileRepository(session)
            profiles = await profile_repo.get_updating_profiles()

        if not profiles:
            return

        logger.info(
            "Found {} profile(s) stuck in UPDATING, checking for recovery...",
            len(profiles),
        )

        recovered = 0
        for profile in profiles:
            async with new_session() as session:
                task_service = TaskService(session)
                has_running = await task_service.has_running_task(
                    profile.repo_id, profile.repo_type
                )

            if has_running:
                logger.info(
                    "  -> Skipping {}: RUNNING task exists, worker will handle it",
                    profile.repo_id,
                )
                continue

            # Determine target status based on whether snapshots exist
            async with new_session() as session:
                snapshot_repo = HfRepoSnapshotRepository(session)
                snapshots, _ = await snapshot_repo.get_repo_with_snapshots(
                    profile.repo_id, profile.repo_type
                )
                target = RepoStatus.ACTIVE if snapshots else RepoStatus.INACTIVE

                profile_repo = HfRepoProfileRepository(session)
                await profile_repo.set_profile_status(
                    repo_id=profile.repo_id,
                    repo_type=profile.repo_type,
                    status=target,
                )
                await session.commit()

            logger.info(
                "  -> Recovered {} from UPDATING to {}",
                profile.repo_id,
                target.value,
            )
            recovered += 1

        if recovered > 0:
            logger.info("Recovered {} profile(s)", recovered)

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

    @staticmethod
    async def _restore_profile_in_session(
        session, repo_id: str, repo_type: str
    ) -> None:
        """Restore profile status within an existing session.

        Checks for an active snapshot: sets profile to ACTIVE if one
        exists, otherwise INACTIVE. Used as a safety net in exception
        handlers so profile recovery and task status update share a
        transaction.
        """
        snapshot_repo = HfRepoSnapshotRepository(session)
        snapshots, _ = await snapshot_repo.get_repo_with_snapshots(
            repo_id, repo_type
        )
        target = RepoStatus.ACTIVE if snapshots else RepoStatus.INACTIVE

        profile_repo = HfRepoProfileRepository(session)
        await profile_repo.set_profile_status(
            repo_id=repo_id,
            repo_type=repo_type,
            status=target,
        )

    async def _maybe_retry_task(self, task: Task, error: Exception) -> bool:
        """Retry a failed task if the error is transient and retries remain.

        Returns True if the task was requeued, False if it should be failed.
        """
        if not self._is_retryable_error(error):
            return False

        retry_count = getattr(task, "retry_count", 0)
        if retry_count >= settings.WORKER_MAX_RETRIES:
            logger.info(
                "Task {} reached max retries ({}/{}) — failing permanently",
                task.id,
                retry_count,
                settings.WORKER_MAX_RETRIES,
            )
            return False

        delay = min(
            settings.WORKER_RETRY_BASE_DELAY * (2 ** retry_count),
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
                    session, task.repo_id, task.repo_type
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

    async def _run_task(self, task: Task) -> None:
        """Process a single task (semaphore released by done callback in start())."""
        await self._process_task(task)

    async def _process_task(
        self,
        task: Task,
    ) -> None:
        """Process a single task with cancellation support."""
        # Determine handler based on source (huggingface or modelscope)
        handler_name = f"download_{task.source}"
        handler = self._handlers.get(handler_name)

        if not handler:
            async with new_session() as session:
                task_service = TaskService(session)
                await task_service.fail(task.id, f"No handler for source: {task.source}")
                await session.commit()
            return

        # Create task control for this task
        task_control = TaskControl()
        self._task_controls[task.id] = task_control

        try:
            logger.info(
                "Processing task {}: {} ({})", task.id, task.repo_id, task.source
            )
            await handler(task, task_control)

            # Check if cancelled or paused before marking complete
            if task_control.cancel_event.is_set():
                async with new_session() as session:
                    ts = TaskService(session)
                    await ts.cancel(task.id)
                    await session.commit()
                logger.info("Task {} cancelled by user", task.id)
                await self._send_notification(task, "cancelled")
            elif task_control.pause_event.is_set():
                # Handler completed normally despite pause being requested — all
                # work finished before the pause could take effect
                async with new_session() as session:
                    ts = TaskService(session)
                    await ts.complete(task.id)
                    await session.commit()
                logger.info(
                    "Task {} completed (pause request arrived after all work finished)",
                    task.id,
                )
                await self._send_notification(task, "completed")
            else:
                async with new_session() as session:
                    ts = TaskService(session)
                    await ts.complete(task.id)
                    await session.commit()
                logger.info("Completed task {}", task.id)
                await self._send_notification(task, "completed")

        except TaskCancelledError:
            async with new_session() as session:
                ts = TaskService(session)
                await ts.cancel(task.id)
                await self._restore_profile_in_session(
                    session, task.repo_id, task.repo_type
                )
                await session.commit()
            logger.info("Task {} cancelled by user", task.id)
            await self._send_notification(task, "cancelled")
        except TaskPausedError:
            async with new_session() as session:
                ts = TaskService(session)
                await ts.pause(task.id)
                await self._restore_profile_in_session(
                    session, task.repo_id, task.repo_type
                )
                await session.commit()
            logger.info("Task {} paused by user", task.id)
        except Exception as e:
            logger.exception("Failed task {}: {}", task.id, e)
            if await self._maybe_retry_task(task, e):
                return
            try:
                async with new_session() as session:
                    ts = TaskService(session)
                    await ts.fail(task.id, str(e))
                    await self._restore_profile_in_session(
                        session, task.repo_id, task.repo_type
                    )
                    await session.commit()
            except Exception as fail_error:
                logger.error(
                    "Critical: Failed to update task {} status to FAILED: {}",
                    task.id,
                    fail_error,
                )
            await self._send_notification(task, "failed", str(e))
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
                        logger.info(
                            "Detected pause request for task {}", task_id
                        )
                        control.pause_event.set()

            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.warning("Error in batch watch: {}", e)
