"""Worker core implementation using PostgreSQL FOR UPDATE SKIP LOCKED.

This module provides the Worker class for processing tasks concurrently
from a PostgreSQL-based task queue.
"""

import asyncio
import signal
from typing import Any, Callable, Dict

from loguru import logger

from services import task_notification_service
from services.task import TaskService, Task, TaskStatus


class CancelledError(Exception):
    """Exception raised when a task is cancelled by user."""

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
        self._handlers: Dict[str, Callable[[Task, asyncio.Event], Any]] = {}
        self._running = False
        self._logger = logger
        self._task_service = TaskService()
        self._cancel_events: Dict[int, asyncio.Event] = {}

    def register(self, name: str) -> Callable:
        """Register a task handler.

        Usage:
            @worker.register("download_model")
            async def handle_download(task: Task, cancel_event: asyncio.Event):
                ...
        """

        def decorator(func: Callable) -> Callable:
            self._handlers[name] = func
            return func

        return decorator

    async def start(self) -> None:
        """Start the worker loop."""
        self._running = True
        self._logger.info("Started, polling every {}s", self.poll_interval)
        self._logger.info("Max concurrent tasks: {}", self.max_concurrent)
        self._logger.info("Press Ctrl+C to stop")

        # Register signal handlers for graceful shutdown (Windows compatible)
        signal.signal(signal.SIGINT, lambda s, f: self._signal_handler())
        signal.signal(signal.SIGTERM, lambda s, f: self._signal_handler())

        semaphore = asyncio.Semaphore(self.max_concurrent)
        running_tasks: set[asyncio.Task] = set()

        while self._running:
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

                # Process task and release semaphore when done
                async def process_and_release(task: Task) -> None:
                    try:
                        await self._process_task(self._task_service, task)
                    finally:
                        semaphore.release()

                t = asyncio.create_task(process_and_release(task))
                running_tasks.add(t)
                t.add_done_callback(running_tasks.discard)

            except Exception as e:
                # Release semaphore on error to avoid leaking slots
                semaphore.release()
                self._logger.error("Error: {}", e)
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
        for event in self._cancel_events.values():
            event.set()
        self._logger.info("Signalled {} task(s) to cancel", len(self._cancel_events))

    def _signal_handler(self) -> None:
        """Handle shutdown signals."""
        self._logger.info("Shutting down...")
        self.stop()

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

        # Create cancel event for this task
        cancel_event = asyncio.Event()
        self._cancel_events[task.id] = cancel_event

        # Start watching for cancellation requests
        watch_task = asyncio.create_task(
            self._watch_for_cancellation(task_manager, task.id, cancel_event)
        )

        try:
            self._logger.info(
                "Processing task {}: {} ({})", task.id, task.repo_id, task.source
            )
            await handler(task, cancel_event)

            # Check if cancelled before marking complete
            if cancel_event.is_set():
                await task_manager.cancel(task.id)
                self._logger.info("Task {} cancelled by user", task.id)
                # Send cancellation notification
                await task_notification_service.send_task_notification(
                    task, "cancelled"
                )
            else:
                await task_manager.complete(task.id)
                self._logger.info("Completed task {}", task.id)
                # Send completion notification
                await task_notification_service.send_task_notification(
                    task, "completed"
                )

        except CancelledError:
            await task_manager.cancel(task.id)
            self._logger.info("Task {} cancelled by user", task.id)
            # Send cancellation notification
            await task_notification_service.send_task_notification(task, "cancelled")
        except Exception as e:
            self._logger.error("Failed task {}: {}", task.id, e)
            try:
                await task_manager.fail(task.id, str(e))
                # Send failure notification
                await task_notification_service.send_task_notification(
                    task, "failed", str(e)
                )
            except Exception as fail_error:
                self._logger.error(
                    "Critical: Failed to update task {} status to FAILED: {}",
                    task.id,
                    fail_error,
                )
        finally:
            # Stop the watch task
            watch_task.cancel()
            try:
                await watch_task
            except asyncio.CancelledError:
                pass
            # Clean up
            self._cancel_events.pop(task.id, None)

    async def _watch_for_cancellation(
        self,
        task_manager: TaskService,
        task_id: int,
        cancel_event: asyncio.Event,
    ) -> None:
        """Watch for cancellation requests by polling the database.

        This runs as a background task during task execution.
        When the task status is changed to CANCELING, it sets the
        cancel_event to signal the handler to terminate gracefully.

        Args:
            task_manager: Task manager instance
            task_id: Task ID to watch
            cancel_event: Event to set when cancellation is detected
        """
        while True:
            try:
                await asyncio.sleep(self.cancel_check_interval)

                # Check if we should stop
                if not self._running:
                    return

                # Query current task status
                task = await task_manager.get_task(task_id)
                if task and task.status == TaskStatus.CANCELING:
                    self._logger.info(
                        "Detected cancellation request for task {}", task_id
                    )
                    cancel_event.set()
                    return

            except asyncio.CancelledError:
                # Task was cancelled (normal during cleanup)
                return
            except Exception as e:
                self._logger.warning("Error checking cancellation status: {}", e)
