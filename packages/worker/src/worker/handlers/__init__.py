"""Task handlers for the worker."""

from __future__ import annotations

from typing import TYPE_CHECKING

from worker.handlers.base import HandlerFunc, TaskControl, ExecutionResult
from worker.handlers.base_handler import BaseDownloadHandler
from worker.handlers.diff_calculator import FileDiff, calculate_file_diff
from worker.handlers.download_context import DownloadContext
from worker.handlers.file_processor import (
    FileProcessContext,
    FileProcessInfrastructure,
    FileProcessResult,
    download_and_upload_files,
)
from worker.handlers.exceptions import (
    TaskControlError,
    TaskCancelledError,
    TaskPausedError,
)
from worker.handlers.types import (
    SourceFile,
    SourceFolder,
    SourceTreeItem,
    CachedFileInfo,
    UrlBuilder,
    AuthHeaderBuilder,
)
from worker.handlers.hf import handle_download_huggingface
from worker.handlers.hf.profile_recovery import (
    recover_hf_updating_profiles,
    restore_hf_profile_in_session,
)
from worker.handlers.downloader import (
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
    "ExecutionResult",
    "BaseDownloadHandler",
    "FileDiff",
    "calculate_file_diff",
    "DownloadContext",
    "FileProcessContext",
    "FileProcessInfrastructure",
    "FileProcessResult",
    "download_and_upload_files",
    "TaskControlError",
    "TaskCancelledError",
    "TaskPausedError",
    "SourceFile",
    "SourceFolder",
    "SourceTreeItem",
    "CachedFileInfo",
    "UrlBuilder",
    "AuthHeaderBuilder",
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
    """Register all task handlers and profile recoveries to the worker instance."""
    worker.register("download_huggingface", handle_download_huggingface)
    worker.register_profile_recovery(
        source="huggingface",
        recovery_func=restore_hf_profile_in_session,
        startup_recovery=recover_hf_updating_profiles,
    )
