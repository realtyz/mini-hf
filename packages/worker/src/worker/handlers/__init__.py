"""Task handlers for the worker."""

from worker.handlers.base import HandlerFunc, TaskHandler
from worker.handlers.hf import handle_download_huggingface
from worker.handlers._downloader import (
    HttpFileDownloader,
    ProgressInfo,
    DownloaderError,
    DownloadCancelledError,
    DownloadError,
)

__all__ = [
    "HandlerFunc",
    "TaskHandler",
    "handle_download_huggingface",
    "register_handlers",
    "HttpFileDownloader",
    "ProgressInfo",
    "DownloaderError",
    "DownloadCancelledError",
    "DownloadError",
]


def register_handlers(worker) -> None:
    """Register all task handlers to the worker instance.

    Args:
        worker: The Worker instance to register handlers with
    """
    worker.register("download_huggingface")(handle_download_huggingface)
