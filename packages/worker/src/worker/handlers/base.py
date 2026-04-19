"""Base handler types for task processors."""

import asyncio
from typing import Awaitable, Callable, Protocol

from services.task import Task


class TaskControl:
    """Task control signals passed to handlers.

    Provides both cancel and pause events so handlers can distinguish
    between immediate cancellation and graceful pause (complete current
    file, then stop).
    """

    def __init__(self):
        self.cancel_event = asyncio.Event()
        self.pause_event = asyncio.Event()


class TaskHandler(Protocol):
    """Protocol for task handlers."""

    async def __call__(self, task: Task, task_control: TaskControl) -> None:
        """Process a task with cancellation and pause support.

        Args:
            task: The task to process
            task_control: Control signals for cancel/pause
        """
        ...


# Type alias for handler functions
HandlerFunc = Callable[[Task, TaskControl], Awaitable[None]]
