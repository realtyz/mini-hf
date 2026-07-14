"""Task handlers for the worker."""

from __future__ import annotations

from typing import TYPE_CHECKING

from database.db_models import Source
from worker.handlers.contracts import HandlerFunc, TaskControl, ExecutionResult
from worker.handlers.base_handler import (
    BaseDownloadHandler,
    ProfileLifecycle,
    TreeLifecycle,
    DownloadInfrastructure,
    CleanupLifecycle,
)
from worker.handlers.diff_calculator import FileDiff, calculate_file_diff
from worker.handlers.download_context import DownloadContext
from worker.handlers.file_processor import (
    FileProcessContext,
    FileProcessInfrastructure,
    FileProcessResult,
    download_and_upload_files,
)
from worker.handlers.source_types import (
    SourceFile,
    SourceFolder,
    SourceTreeItem,
    CachedFileInfo,
    UrlBuilder,
    AuthHeaderBuilder,
    BlobKeyBuilder,
)
from worker.handlers.hf import handle_download_huggingface
from worker.handlers.hf.profile_recovery import (
    recover_hf_updating_profiles,
    restore_hf_profile_in_session,
)
from worker.handlers.ms import handle_download_modelscope
from worker.handlers.ms.profile_recovery import (
    recover_ms_updating_profiles,
    restore_ms_profile_in_session,
)
from worker.handlers.progress_tracker import TaskProgressTracker
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
    "TaskProgressTracker",
    "BaseDownloadHandler",
    "ProfileLifecycle",
    "TreeLifecycle",
    "DownloadInfrastructure",
    "CleanupLifecycle",
    "FileDiff",
    "calculate_file_diff",
    "DownloadContext",
    "FileProcessContext",
    "FileProcessInfrastructure",
    "FileProcessResult",
    "download_and_upload_files",
    "SourceFile",
    "SourceFolder",
    "SourceTreeItem",
    "CachedFileInfo",
    "UrlBuilder",
    "AuthHeaderBuilder",
    "BlobKeyBuilder",
    "handle_download_huggingface",
    "handle_download_modelscope",
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
        source=Source.HUGGINGFACE.value,
        recovery_func=restore_hf_profile_in_session,
        startup_recovery=recover_hf_updating_profiles,
    )
    # ModelScope
    worker.register("download_modelscope", handle_download_modelscope)
    worker.register_profile_recovery(
        source=Source.MODELSCOPE.value,
        recovery_func=restore_ms_profile_in_session,
        startup_recovery=recover_ms_updating_profiles,
    )
