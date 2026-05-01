"""Base exceptions for task handlers.

All handler-specific control flow exceptions should inherit from these
base classes so the Worker loop can catch them without knowing about
concrete handler implementations.
"""


class TaskControlError(Exception):
    """Base for all task control flow exceptions (cancel, pause, etc.)."""


class TaskCancelledError(TaskControlError):
    """Handler signals the task was cancelled."""


class TaskPausedError(TaskControlError):
    """Handler signals the task was paused."""
