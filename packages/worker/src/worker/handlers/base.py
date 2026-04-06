"""Base handler types for task processors."""

from typing import Awaitable, Callable, Protocol

from services.task import Task


class TaskHandler(Protocol):
    """Protocol for task handlers."""

    async def __call__(self, task: Task) -> None:
        """Process a task.

        Args:
            task: The task to process
        """
        ...


# Type alias for handler functions
HandlerFunc = Callable[[Task], Awaitable[None]]
