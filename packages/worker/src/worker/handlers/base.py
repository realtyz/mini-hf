"""Base handler types for task processors."""

import asyncio
from typing import Awaitable, Callable, Protocol

from services.task import Task


class TaskHandler(Protocol):
    """Protocol for task handlers."""

    async def __call__(self, task: Task, cancel_event: asyncio.Event) -> None:
        """Process a task with cancellation support.

        Args:
            task: The task to process
            cancel_event: Event to signal task cancellation
        """
        ...


# Type alias for handler functions
HandlerFunc = Callable[[Task, asyncio.Event], Awaitable[None]]
