"""Base handler types for task processors."""

import asyncio
from typing import Awaitable, Callable

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


# Type alias for handler functions
HandlerFunc = Callable[[Task, TaskControl], Awaitable[None]]
