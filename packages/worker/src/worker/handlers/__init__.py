"""Task handlers for the worker."""

from __future__ import annotations

from typing import TYPE_CHECKING

from worker.handlers.base import HandlerFunc, TaskControl
from worker.handlers.exceptions import (
    TaskControlError,
    TaskCancelledError,
    TaskPausedError,
)
from worker.handlers.hf import handle_download_huggingface
from worker.handlers._downloader import (
    HttpFileDownloader,
    ProgressInfo,
    DownloaderError,
    DownloadCancelledError,
    DownloadPausedError,
    DownloadError,
)

if TYPE_CHECKING:
    from worker.worker import Worker

__all__ = [
    "HandlerFunc",
    "TaskControl",
    "TaskControlError",
    "TaskCancelledError",
    "TaskPausedError",
    "handle_download_huggingface",
    "register_handlers",
    "HttpFileDownloader",
    "ProgressInfo",
    "DownloaderError",
    "DownloadCancelledError",
    "DownloadPausedError",
    "DownloadError",
]


def register_handlers(worker: Worker) -> None:
    """Register all task handlers to the worker instance."""
    worker.register("download_huggingface", handle_download_huggingface)
