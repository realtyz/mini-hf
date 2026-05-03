"""Background coroutine that watches running tasks for cancel/pause signals."""

import asyncio

from loguru import logger

from database import new_session
from services.task import TaskService, TaskStatus
from worker.handlers.contracts import TaskControl


class TaskWatchdog:
    """Batch-checks running tasks for CANCELING/PAUSING status transitions.

    Replaces the old per-task watch pattern. Queries the database once
    per cycle for all currently-running task IDs, looking for any that
    have transitioned to CANCELING or PAUSING.
    """

    def __init__(
        self,
        task_controls: dict[int, TaskControl],
        check_interval: float,
    ):
        self._task_controls = task_controls
        self._check_interval = check_interval
        self._running = False

    def start(self) -> asyncio.Task:
        """Start watching and return the background asyncio Task."""
        self._running = True
        return asyncio.create_task(self._run())

    def stop(self) -> None:
        """Signal the watchdog to stop at the next cycle."""
        self._running = False

    async def _run(self) -> None:
        """Watch loop — batch-checks all running tasks periodically."""
        while self._running:
            try:
                await asyncio.sleep(self._check_interval)

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
