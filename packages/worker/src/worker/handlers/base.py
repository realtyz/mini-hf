"""Base handler types for task processors."""

import asyncio
from dataclasses import dataclass
from typing import Awaitable, Callable, Literal

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


@dataclass
class ExecutionResult:
    """Result returned by handler execution.

    The handler is responsible for internal cleanup (stats, progress,
    snapshot, profile) regardless of outcome. The worker uses this
    result to decide the final task status in the database.
    """

    status: Literal["completed", "cancelled", "paused", "failed"]
    error: str | None = None
    exception: Exception | None = None


# Type alias for handler functions
HandlerFunc = Callable[[Task, TaskControl], Awaitable[ExecutionResult]]
