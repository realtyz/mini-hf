"""Base download handler — template method for the 6-phase download workflow.

Subclasses implement the source-specific abstract methods while the base
class provides the shared workflow orchestration, error recovery, and
helper logic.

The handler contract is split into four focused protocols (ISP):
- ProfileLifecycle       — prepare_profile, restore_profile
- TreeLifecycle          — resolve_commit, calculate_diff, save_tree
- DownloadInfrastructure — execute_downloads, build_url_builder, build_auth_header_builder
- CleanupLifecycle       — finalize_success, cleanup_new_snapshot
"""

import asyncio
import shutil
from abc import ABC, abstractmethod
from pathlib import Path

from loguru import logger

from core import settings
from database import new_session
from database.db_models import Task
from database.db_repositories import TaskRepository
from cache.exceptions import CacheException
from worker.handlers.downloader import (
    DownloadCancelledError,
    DownloadError,
    DownloadPausedError,
)
from worker.handlers.contracts import TaskControl, ExecutionResult
from worker.handlers.diff_calculator import FileDiff
from worker.handlers.download_context import DownloadContext
from worker.handlers.file_processor import (
    FileProcessContext,
    FileProcessInfrastructure,
    FileProcessResult,
    download_and_upload_files,
)
from worker.handlers.source_types import (
    AuthHeaderBuilder,
    BlobKeyBuilder,
    UrlBuilder,
)
from worker.handlers.progress_tracker import TaskProgressTracker


# ------------------------------------------------------------------
# Protocol ABCs — group abstract methods by lifecycle phase
# ------------------------------------------------------------------


class ProfileLifecycle(ABC):
    """Protocol for profile preparation and recovery (phases 1 + abort)."""

    @abstractmethod
    async def prepare_profile(self) -> None:
        """Phase 1: Set profile status to UPDATING."""

    @abstractmethod
    async def restore_profile(
        self, *, keep_active_on_commit_mismatch: bool = False
    ) -> None:
        """Restore profile status after a non-successful handler exit."""


class TreeLifecycle(ABC):
    """Protocol for commit resolution, diff calculation, and persistence (phases 2-4)."""

    @abstractmethod
    async def resolve_commit(self) -> None:
        """Phase 2: Resolve endpoint and commit hash, populate context fields."""

    @abstractmethod
    async def calculate_diff(self) -> list:
        """Phase 3: Get new tree, compare against old, compute file diff.

        Must populate ``self.ctx.diff`` and ``self.ctx.files_to_download``.

        Returns:
            Raw tree items from source (passed to save_tree).
        """

    @abstractmethod
    async def save_tree(self, tree_items: list) -> None:
        """Phase 4: Save snapshot and tree items to database.

        Must set ``self._new_snapshot_id`` if a new snapshot was created.
        """


class DownloadInfrastructure(ABC):
    """Protocol for file download execution and URL/auth/blob-key configuration (phase 5)."""

    @abstractmethod
    async def execute_downloads(self) -> None:
        """Phase 5: Download files from source and upload to S3."""

    @abstractmethod
    def build_url_builder(self) -> UrlBuilder:
        """Return a UrlBuilder callable for the file processor."""

    @abstractmethod
    def build_auth_header_builder(self) -> AuthHeaderBuilder:
        """Return an AuthHeaderBuilder callable for the file processor."""

    @abstractmethod
    def build_blob_key_builder(self) -> BlobKeyBuilder:
        """Return a BlobKeyBuilder callable for the file processor."""

    @property
    def head_check_enabled(self) -> bool | None:
        """Per-source override for the downloader's HEAD pre-check.

        Returns ``None`` by default, which defers to the global
        ``WORKER_HEAD_CHECK_ENABLED`` setting. Sources whose upstream file
        endpoint does not respond to HEAD (e.g. ModelScope's ``/repo``
        endpoint returns 404 for HEAD) override this to return ``False``
        so the pre-check is skipped and files are fetched directly via GET.
        """
        return None


class CleanupLifecycle(ABC):
    """Protocol for success finalization and abort cleanup (phase 6 + abort)."""

    @abstractmethod
    async def finalize_success(self) -> None:
        """Phase 6: Cleanup, activate snapshot, set profile ACTIVE."""

    @abstractmethod
    async def cleanup_new_snapshot(self) -> None:
        """Delete the INACTIVE snapshot and tree items created by this task."""

    @abstractmethod
    async def _mark_successful_items_cached(self) -> None:
        """Mark successfully downloaded tree items as cached after a failure.

        Called instead of cleanup_new_snapshot when the task fails,
        so that partially-downloaded snapshots can be reused on retry.
        """


class BaseDownloadHandler(
    ProfileLifecycle, TreeLifecycle, DownloadInfrastructure, CleanupLifecycle
):
    """Template for the 6-phase download workflow.

    Phases:
    1. prepare_profile   — Set profile status to UPDATING
    2. resolve_commit    — Resolve source endpoint, commit hash, populate context
    3. calculate_diff    — Compare old vs new tree, compute file diff
    4. save_tree         — Persist snapshot and tree items to database
    5. execute_downloads — Download from source and upload to S3
    6. finalize_success  — Cleanup, activate snapshot, set profile ACTIVE

    Subclasses must implement all methods from the four protocol ABCs.
    The ``execute()`` method is the template that orchestrates the phases
    and handles abort recovery.
    """

    def __init__(self, task: Task, task_control: TaskControl):
        self._task = task
        self._task_control = task_control
        self._progress_tracker = TaskProgressTracker(task.id)
        self._new_snapshot_id: int | None = None
        self._successful_paths: set[str] = set()

        required_file_paths = {
            item["path"]
            for item in (task.repo_items or [])
            if item.get("required", True)
        }
        if not required_file_paths:
            raise ValueError(
                "At least one file must be selected for download (required=true)"
            )

        self.ctx = DownloadContext(
            repo_id=task.repo_id,
            repo_type=task.repo_type,
            revision=task.revision,
            access_token=task.access_token,
            required_file_paths=required_file_paths,
        )

    # ------------------------------------------------------------------
    # Source name (for logging)
    # ------------------------------------------------------------------

    @property
    @abstractmethod
    def source_name(self) -> str:
        """Human-readable source name for log messages (e.g. 'HuggingFace')."""

    # ------------------------------------------------------------------
    # Template method
    # ------------------------------------------------------------------

    async def execute(self) -> ExecutionResult:
        """Run the full download workflow (template method).

        Returns an ExecutionResult indicating the outcome. The handler
        handles all internal cleanup (stats, progress, snapshot, profile)
        regardless of success or failure. The worker is responsible for
        translating the result into the final task status.
        """
        logger.info(
            "  -> Downloading from {}: {} (type: {})",
            self.source_name,
            self.ctx.repo_id,
            self.ctx.repo_type,
        )
        if self.ctx.access_token:
            logger.info("  -> Using provided access token")
        required_count = len(self.ctx.required_file_paths)
        total_count = len(self._task.repo_items or [])
        if required_count == total_count:
            logger.info("  -> Files to download: {}", required_count)
        else:
            logger.info("  -> Files to download: {}/{}", required_count, total_count)

        try:
            await self.prepare_profile()
            await self.resolve_commit()
            tree_items = await self.calculate_diff()
            await self.save_tree(tree_items)
            await self.execute_downloads()
            await self.finalize_success()
            return ExecutionResult(status="completed")
        except DownloadCancelledError:
            logger.info("  -> Download cancelled by user for {}", self.ctx.repo_id)
            await self._handle_abort("cancelled", "Cancelled by user")
            return ExecutionResult(status="cancelled", error="Cancelled by user")
        except DownloadPausedError as e:
            msg = f"Paused: {e}"
            logger.info("  -> Download paused for {}: {}", self.ctx.repo_id, e)
            await self._handle_abort("paused", msg)
            return ExecutionResult(status="paused", error=msg)
        except Exception as e:
            logger.exception("  -> Download failed for {}: {}", self.ctx.repo_id, e)
            await self._handle_abort("failed", str(e))
            return ExecutionResult(status="failed", error=str(e), exception=e)
        finally:
            await self._cleanup_temp_dir()

    # ------------------------------------------------------------------
    # Shared helpers (concrete)
    # ------------------------------------------------------------------

    async def _handle_abort(self, reason: str, error_msg: str) -> None:
        """Unified error recovery for cancelled/paused/failed tasks.

        On any non-successful exit: keep the snapshot and tree items,
        mark successfully downloaded items as cached so they can be
        reused on retry/resume.
        """
        await self._save_download_stats()
        await self._fail_progress(error_msg)
        await self._mark_successful_items_cached()
        await self.restore_profile(
            keep_active_on_commit_mismatch=(reason == "failed"),
        )

    async def _save_download_stats(self) -> tuple[int, int]:
        """Save download progress stats to the task row."""
        downloaded_file_count, downloaded_bytes = 0, 0
        redis_ok = False
        try:
            (
                downloaded_file_count,
                downloaded_bytes,
            ) = await self._progress_tracker.get_progress_snapshot()
            redis_ok = True
        except CacheException:
            pass

        try:
            async with new_session() as session:
                task_repo = TaskRepository(session)
                if not redis_ok:
                    db_count, db_bytes = await task_repo.get_download_stats(
                        self._task.id
                    )
                    downloaded_file_count = db_count
                    downloaded_bytes = db_bytes
                await task_repo.update_download_stats(
                    task_id=self._task.id,
                    downloaded_file_count=downloaded_file_count,
                    downloaded_bytes=downloaded_bytes,
                )
                await session.commit()
        except Exception as stats_error:
            logger.warning("  -> Failed to save downloaded stats: {}", stats_error)

        return downloaded_file_count, downloaded_bytes

    async def _fail_progress(self, message: str) -> None:
        """Mark the progress tracker as failed and clear it."""
        try:
            await self._progress_tracker.fail_task(message)
            await self._progress_tracker.clear()
        except CacheException as tracker_error:
            logger.warning("  -> Failed to update progress tracker: {}", tracker_error)

    async def _run_file_processor(
        self,
        files_to_download: list,
        diff: FileDiff | None,
    ) -> list[FileProcessResult]:
        """Run the generic download-and-upload pipeline.

        Handles progress init, semaphore setup, and post-download
        cached-status updates. Subclasses call this from their
        ``execute_downloads`` implementation.
        """
        if not files_to_download:
            return []

        logger.info(
            "  -> Downloading {} files (filtered from {})",
            len(files_to_download),
            len(diff.download) + len(diff.update) if diff else 0,
        )

        total_bytes = sum(f.size for f in files_to_download)
        await self._progress_tracker.init_task(
            total_files=len(files_to_download),
            total_bytes=total_bytes,
        )

        process_ctx = FileProcessContext(
            repo_id=self.ctx.repo_id,
            repo_type=self.ctx.repo_type,
            commit_hash=self.ctx.new_commit_hash,
            access_token=self.ctx.access_token,
            progress_tracker=self._progress_tracker,
            url_builder=self.build_url_builder(),
            auth_header_builder=self.build_auth_header_builder(),
            blob_key_builder=self.build_blob_key_builder(),
            head_check_enabled=self.head_check_enabled,
            infra=FileProcessInfrastructure(
                download_semaphore=asyncio.Semaphore(
                    settings.WORKER_CONCURRENT_DOWNLOADS
                ),
                upload_semaphore=asyncio.Semaphore(settings.WORKER_CONCURRENT_UPLOADS),
                check_semaphore=asyncio.Semaphore(settings.WORKER_CONCURRENT_S3_CHECKS),
                cancel_event=self._task_control.cancel_event,
                pause_event=self._task_control.pause_event,
            ),
        )
        try:
            return await download_and_upload_files(
                ctx=process_ctx,
                files=files_to_download,
            )
        except (DownloadCancelledError, DownloadError, DownloadPausedError) as e:
            self._successful_paths = set(getattr(e, "successful_paths", []))
            raise

    async def _cleanup_temp_dir(self) -> None:
        """Remove the temp directory for a repo download."""
        try:
            repo_dir = Path(settings.INCOMPLETE_FILE_PATH) / self.ctx.repo_id.replace(
                "/", "--"
            )
            if repo_dir.exists():
                await asyncio.to_thread(shutil.rmtree, repo_dir)
                logger.info("  -> Cleaned up temp directory: {}", repo_dir)
        except Exception as cleanup_error:
            logger.warning("  -> Failed to clean up temp directory: {}", cleanup_error)
