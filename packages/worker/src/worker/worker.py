"""Worker core implementation using PostgreSQL FOR UPDATE SKIP LOCKED.

This module provides the Worker class for processing tasks concurrently
from a PostgreSQL-based task queue.
"""

import asyncio
import platform
import signal
from typing import Awaitable, Callable

from loguru import logger

from services import task_notification_service
from services.task import TaskService, Task, TaskStatus
from worker.handlers.hf.cleanup import cleanup_stale_incomplete_files
from worker.handlers._downloader import DownloadCancelledError, DownloadPausedError
from worker.handlers.base import TaskControl

HandlerFunc = Callable[[Task, TaskControl], Awaitable[None]]


class CancelledError(Exception):
    """Exception raised when a task is cancelled by user."""

    pass


class PausedError(Exception):
    """Exception raised when a task is paused by user."""

    pass


class Worker:
    """Task worker using PostgreSQL FOR UPDATE SKIP LOCKED.

    This worker continuously polls the database for pending tasks
    and processes them concurrently. Multiple workers can run
    simultaneously without conflicts thanks to SKIP LOCKED.
    """

    def __init__(
        self,
        poll_interval: float = 2.0,
        max_concurrent: int = 1,
        cancel_check_interval: float = 5.0,
    ):
        """Initialize the worker.

        Args:
            poll_interval: Seconds between polling when no tasks
            max_concurrent: Maximum concurrent tasks to process
            cancel_check_interval: Seconds between checking for cancellation
        """
        self.poll_interval = poll_interval
        self.max_concurrent = max_concurrent
        self.cancel_check_interval = cancel_check_interval
        self._handlers: dict[str, HandlerFunc] = {}
        self._running = False
        self._logger = logger
        self._task_service = TaskService()
        self._task_controls: dict[int, TaskControl] = {}

    def register(self, name: str):
        """Register a task handler.

        Usage:
            @worker.register("download_model")
            async def handle_download(task: Task, cancel_event: asyncio.Event):
                ...
        """

        def decorator(func: HandlerFunc) -> HandlerFunc:
            self._handlers[name] = func
            return func

        return decorator

    async def start(self) -> None:
        """Start the worker loop."""
        self._running = True
        self._logger.info("Started, polling every {}s", self.poll_interval)
        self._logger.info("Max concurrent tasks: {}", self.max_concurrent)
        self._logger.info("Press Ctrl+C to stop")

        cleanup_stale_incomplete_files()

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

        while self._running:
            task_launched = False
            try:
                # Wait for an available slot before fetching a task
                # This ensures we don't pull tasks from DB when at max concurrency
                await semaphore.acquire()

                # Check if shutdown was requested while waiting for semaphore
                if not self._running:
                    semaphore.release()
                    break

                # Try to fetch a single task using FOR UPDATE SKIP LOCKED
                tasks = await self._task_service.get_next_task(batch_size=1)

                if not tasks:
                    # No tasks available, release the slot and wait
                    semaphore.release()
                    await asyncio.sleep(self.poll_interval)
                    continue

                task = tasks[0]
                self._logger.info("Got task: {}", task.id)

                # Once create_task succeeds, semaphore ownership transfers to _run_task
                t = asyncio.create_task(self._run_task(task, semaphore))
                task_launched = True
                running_tasks.add(t)
                t.add_done_callback(running_tasks.discard)

            except Exception as e:
                # Only release semaphore if task was NOT launched (ownership not transferred)
                if not task_launched:
                    semaphore.release()
                self._logger.exception("Error in task processing: {}", e)
                await asyncio.sleep(self.poll_interval)

        # Wait for all running tasks to complete cleanup
        if running_tasks:
            self._logger.info(
                "Waiting for {} task(s) to complete...", len(running_tasks)
            )
            await asyncio.gather(*running_tasks, return_exceptions=True)

        self._logger.info("Stopped")

    def stop(self) -> None:
        """Stop the worker gracefully."""
        self._running = False
        # Signal all running tasks to cancel
        for tc in self._task_controls.values():
            tc.cancel_event.set()
        self._logger.info("Signalled {} task(s) to cancel", len(self._task_controls))

    def _signal_handler(self) -> None:
        """Handle shutdown signals."""
        self._logger.info("Shutting down...")
        self.stop()

    async def _run_task(self, task: Task, semaphore: asyncio.Semaphore) -> None:
        """Process a task and release the semaphore when done."""
        try:
            await self._process_task(self._task_service, task)
        finally:
            semaphore.release()

    async def _process_task(
        self,
        task_manager: TaskService,
        task: Task,
    ) -> None:
        """Process a single task with cancellation support."""
        # Determine handler based on source (huggingface or modelscope)
        handler_name = f"download_{task.source}"
        handler = self._handlers.get(handler_name)

        if not handler:
            await task_manager.fail(task.id, f"No handler for source: {task.source}")
            return

        # Create task control for this task
        task_control = TaskControl()
        self._task_controls[task.id] = task_control

        # Start watching for task status changes (cancel/pause)
        watch_task = asyncio.create_task(
            self._watch_for_task_status(task_manager, task.id, task_control)
        )

        try:
            self._logger.info(
                "Processing task {}: {} ({})", task.id, task.repo_id, task.source
            )
            await handler(task, task_control)

            # Check if cancelled or paused before marking complete
            if task_control.cancel_event.is_set():
                await task_manager.cancel(task.id)
                self._logger.info("Task {} cancelled by user", task.id)
                try:
                    await task_notification_service.send_task_notification(
                        task, "cancelled"
                    )
                except Exception:
                    self._logger.warning("Failed to send cancellation notification")
            elif task_control.pause_event.is_set():
                # Handler completed normally despite pause being requested — all
                # work finished before the pause could take effect
                await task_manager.complete(task.id)
                self._logger.info(
                    "Task {} completed (pause request arrived after all work finished)",
                    task.id,
                )
                try:
                    await task_notification_service.send_task_notification(
                        task, "completed"
                    )
                except Exception:
                    self._logger.warning("Failed to send completion notification")
            else:
                await task_manager.complete(task.id)
                self._logger.info("Completed task {}", task.id)
                try:
                    await task_notification_service.send_task_notification(
                        task, "completed"
                    )
                except Exception:
                    self._logger.warning("Failed to send completion notification")

        except (CancelledError, DownloadCancelledError):
            await task_manager.cancel(task.id)
            self._logger.info("Task {} cancelled by user", task.id)
            try:
                await task_notification_service.send_task_notification(
                    task, "cancelled"
                )
            except Exception:
                self._logger.warning("Failed to send cancellation notification")
        except DownloadPausedError:
            await task_manager.pause(task.id)
            self._logger.info("Task {} paused by user", task.id)
        except Exception as e:
            self._logger.exception("Failed task {}: {}", task.id, e)
            try:
                await task_manager.fail(task.id, str(e))
            except Exception as fail_error:
                self._logger.error(
                    "Critical: Failed to update task {} status to FAILED: {}",
                    task.id,
                    fail_error,
                )
            try:
                await task_notification_service.send_task_notification(
                    task, "failed", str(e)
                )
            except Exception:
                self._logger.warning("Failed to send failure notification")
        finally:
            # Stop the watch task
            watch_task.cancel()
            try:
                await watch_task
            except asyncio.CancelledError:
                pass
            # Clean up
            self._task_controls.pop(task.id, None)

    async def _watch_for_task_status(
        self,
        task_manager: TaskService,
        task_id: int,
        task_control: TaskControl,
    ) -> None:
        """Watch for cancellation and pause requests by polling the database.

        This runs as a background task during task execution.
        When the task status changes to CANCELING or PAUSING, it sets the
        corresponding event to signal the handler to terminate gracefully.

        Args:
            task_manager: Task manager instance
            task_id: Task ID to watch
            task_control: Control object with cancel/pause events
        """
        while True:
            try:
                await asyncio.sleep(self.cancel_check_interval)

                # Check if we should stop
                if not self._running:
                    return

                # Query current task status
                task = await task_manager.get_task(task_id)
                if not task:
                    return
                if task.status == TaskStatus.CANCELING:
                    self._logger.info(
                        "Detected cancellation request for task {}", task_id
                    )
                    task_control.cancel_event.set()
                    return
                if task.status == TaskStatus.PAUSING:
                    self._logger.info("Detected pause request for task {}", task_id)
                    task_control.pause_event.set()
                    return

            except asyncio.CancelledError:
                # Task was cancelled (normal during cleanup)
                return
            except Exception as e:
                self._logger.warning("Error checking task status: {}", e)
