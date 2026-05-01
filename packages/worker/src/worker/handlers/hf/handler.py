"""Main HuggingFace download handler."""

import asyncio
import shutil
from pathlib import Path

from loguru import logger
from huggingface_hub import RepoFile
from services.config import ConfigService
from services.huggingface import HuggingfaceService

from core import settings
from database import new_session, RepoStatus
from database.db_models import HfRepoTreeItem, Task
from database.db_repositories import (
    HfRepoProfileRepository,
    HfRepoSnapshotRepository,
    HfRepoTreeRepository,
    TaskRepository,
)
from worker.handlers.hf.cleanup import cleanup_deleted_files
from worker.handlers.hf.diff_calculator import calculate_file_diff
from worker.handlers.hf.download_context import DownloadContext
from worker.handlers.hf.file_processor import (
    FileProcessContext,
    FileProcessInfrastructure,
    download_and_upload_files,
)
from worker.handlers.hf.tree_saver import save_repo_tree
from worker.handlers._downloader import DownloadCancelledError, DownloadPausedError
from worker.handlers.base import TaskControl
from worker.services import TaskProgressTracker


class HfDownloadHandler:
    """Coordinate HF download workflow for a single task.

    Phases:
    1. Set profile to UPDATING
    2. Resolve commit hash
    3. Calculate file diff
    4. Save repo tree
    5. Download/upload files
    6. Finalize (cleanup, activate, set ACTIVE)
    """

    def __init__(self, task: Task, task_control: TaskControl):
        self._task = task
        self._task_control = task_control
        self._progress_tracker = TaskProgressTracker(task.id)
        self._new_snapshot_id: int | None = None

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
    # Public entry point
    # ------------------------------------------------------------------

    async def execute(self) -> None:
        """Run the full download workflow."""
        logger.info(
            "  -> Downloading from HuggingFace: {} (type: {})",
            self.ctx.repo_id,
            self.ctx.repo_type,
        )
        if self.ctx.access_token:
            logger.info("  -> Using provided access token")
        logger.info(
            "  -> Files to download: {}/{}",
            len(self.ctx.required_file_paths),
            len(self._task.repo_items or []),
        )

        try:
            await self._prepare_profile()
            operator = await self._resolve_commit()
            tree_items = await self._calculate_diff(operator)
            await self._save_tree(tree_items)
            await self._execute_downloads()
            await self._finalize_success()
        except DownloadCancelledError:
            logger.info("  -> Download cancelled by user for {}", self.ctx.repo_id)
            await self._handle_abort("cancelled", "Cancelled by user")
            raise
        except DownloadPausedError as e:
            logger.info("  -> Download paused for {}: {}", self.ctx.repo_id, e)
            await self._handle_abort("paused", f"Paused: {e}")
            raise
        except Exception as e:
            logger.exception("  -> Download failed for {}: {}", self.ctx.repo_id, e)
            await self._handle_abort("failed", str(e))
            raise
        finally:
            self._cleanup_temp_dir()

    # ------------------------------------------------------------------
    # Phase 1: Profile preparation
    # ------------------------------------------------------------------

    async def _prepare_profile(self) -> None:
        """Set profile status to UPDATING."""
        async with new_session() as session:
            profile_repo = HfRepoProfileRepository(session)
            await profile_repo.get_or_create_profile(
                repo_id=self.ctx.repo_id,
                repo_type=self.ctx.repo_type,
                initial_status=RepoStatus.UPDATING,
            )
            await profile_repo.set_profile_status(
                repo_id=self.ctx.repo_id,
                repo_type=self.ctx.repo_type,
                status=RepoStatus.UPDATING,
            )
            await session.commit()
        logger.info("  -> Profile status set to UPDATING for {}", self.ctx.repo_id)

    # ------------------------------------------------------------------
    # Phase 2: Commit resolution
    # ------------------------------------------------------------------

    async def _resolve_commit(self) -> HuggingfaceService:
        """Resolve endpoint and commit hash, populate context fields."""
        async with new_session() as session:
            config_service = ConfigService(session)
            self.ctx.endpoint = (
                self._task.hf_endpoint or await config_service.get_hf_default_endpoint()
            )
        logger.info("  -> Using HF endpoint: {}", self.ctx.endpoint)

        operator = HuggingfaceService(
            token=self.ctx.access_token, endpoint=self.ctx.endpoint
        )
        repo_info = await operator.get_repo_info(
            self.ctx.repo_id, self.ctx.repo_type, self.ctx.revision
        )

        self.ctx.new_commit_hash = repo_info.sha or ""
        self.ctx.committed_at = repo_info.last_modified
        self.ctx.pipeline_tag = getattr(repo_info, "pipeline_tag", None)

        if not self.ctx.new_commit_hash:
            raise ValueError(
                f"Could not resolve commit_hash for {self.ctx.repo_id}@{self.ctx.revision}"
            )
        logger.info(
            "  -> Resolved {}@{} -> commit {}",
            self.ctx.repo_id,
            self.ctx.revision,
            self.ctx.new_commit_hash[:8],
        )

        return operator

    # ------------------------------------------------------------------
    # Phase 3: Diff calculation
    # ------------------------------------------------------------------

    async def _calculate_diff(self, operator: HuggingfaceService) -> list:
        """Check existing snapshot, get new tree, and calculate file diff."""
        old_tree: list[HfRepoTreeItem] = []

        async with new_session() as session:
            snapshot_repo = HfRepoSnapshotRepository(session)
            existing_snapshot = await snapshot_repo.get_active_snapshot(
                self.ctx.repo_id, self.ctx.repo_type, self.ctx.revision
            )

            if existing_snapshot:
                self.ctx.old_commit_hash = existing_snapshot.commit_hash
                logger.info(
                    "  -> Updating {}@{}: {} -> {}",
                    self.ctx.repo_id,
                    self.ctx.revision,
                    existing_snapshot.commit_hash[:8],
                    self.ctx.new_commit_hash[:8],
                )
                tree_repo = HfRepoTreeRepository(session)
                old_tree = await tree_repo.get_file_tree(existing_snapshot.commit_hash)
            else:
                logger.info(
                    "  -> First time caching {}@{} ({})",
                    self.ctx.repo_id,
                    self.ctx.revision,
                    self.ctx.new_commit_hash[:8],
                )

        new_tree_items = await operator.get_tree(
            self.ctx.repo_id, self.ctx.repo_type, self.ctx.revision
        )
        new_files = [f for f in new_tree_items if isinstance(f, RepoFile)]

        diff = calculate_file_diff(old_tree, new_files)
        self.ctx.diff = diff
        logger.info(
            "  -> File diff: {} keep, {} download, {} update, {} delete",
            len(diff.keep),
            len(diff.download),
            len(diff.update),
            len(diff.delete),
        )

        self.ctx.files_to_download = [
            f
            for f in diff.download + [item for _, item in diff.update]
            if f.path in self.ctx.required_file_paths
        ]

        return new_tree_items

    # ------------------------------------------------------------------
    # Phase 4: Save repo tree
    # ------------------------------------------------------------------

    async def _save_tree(self, tree_items: list) -> None:
        """Save snapshot and tree items to database."""
        async with new_session() as session:
            snapshot_repo = HfRepoSnapshotRepository(session)
            tree_repo = HfRepoTreeRepository(session)
            created = await save_repo_tree(
                session=session,
                snapshot_repo=snapshot_repo,
                tree_repo=tree_repo,
                tree_items=tree_items,
                repo_id=self.ctx.repo_id,
                repo_type=self.ctx.repo_type,
                revision=self.ctx.revision,
                commit_hash=self.ctx.new_commit_hash,
                committed_at=self.ctx.committed_at,
            )
            await session.commit()

            if created:
                snapshot = await snapshot_repo.get_snapshot_by_repo(
                    repo_id=self.ctx.repo_id,
                    repo_type=self.ctx.repo_type,
                    revision=self.ctx.revision,
                    commit_hash=self.ctx.new_commit_hash,
                )
                if snapshot:
                    self._new_snapshot_id = snapshot.id

        logger.info(
            "  -> Saved snapshot and tree items for {}@{}",
            self.ctx.repo_id,
            self.ctx.new_commit_hash[:8],
        )

    # ------------------------------------------------------------------
    # Phase 5: Download & upload
    # ------------------------------------------------------------------

    async def _execute_downloads(self) -> None:
        """Download and upload files, then update cached status in DB."""
        if not self.ctx.files_to_download:
            return

        diff = self.ctx.diff
        logger.info(
            "  -> Downloading {} files (filtered from {})",
            len(self.ctx.files_to_download),
            len(diff.download) + len(diff.update) if diff else 0,
        )

        total_bytes = sum(f.size for f in self.ctx.files_to_download)
        await self._progress_tracker.init_task(
            total_files=len(self.ctx.files_to_download),
            total_bytes=total_bytes,
        )

        # Paths that are new downloads (not updates) can skip the pre-download
        # S3 check — the upload-phase check still guards against duplicates.
        download_paths = {f.path for f in diff.download} if diff else set()

        process_ctx = FileProcessContext(
            repo_id=self.ctx.repo_id,
            repo_type=self.ctx.repo_type,
            commit_hash=self.ctx.new_commit_hash,
            access_token=self.ctx.access_token,
            cancel_event=self._task_control.cancel_event,
            pause_event=self._task_control.pause_event,
            progress_tracker=self._progress_tracker,
            endpoint=self.ctx.endpoint,
            infra=FileProcessInfrastructure(
                download_semaphore=asyncio.Semaphore(
                    settings.WORKER_CONCURRENT_DOWNLOADS
                ),
                upload_semaphore=asyncio.Semaphore(settings.WORKER_CONCURRENT_UPLOADS),
                check_semaphore=asyncio.Semaphore(settings.WORKER_CONCURRENT_S3_CHECKS),
            ),
            skip_s3_check_paths=download_paths,
        )
        successful_results = await download_and_upload_files(
            ctx=process_ctx,
            files=self.ctx.files_to_download,
        )

        async with new_session() as session:
            tree_repo = HfRepoTreeRepository(session)
            for result in successful_results:
                await tree_repo.set_item_cached(
                    commit_hash=self.ctx.new_commit_hash,
                    path=result.path,
                )
            await session.commit()

    # ------------------------------------------------------------------
    # Phase 6: Finalize success
    # ------------------------------------------------------------------

    async def _finalize_success(self) -> None:
        """Cleanup deleted files, activate snapshot, set profile ACTIVE."""
        if self.ctx.diff and self.ctx.diff.delete:
            async with new_session() as session:
                tree_repo = HfRepoTreeRepository(session)
                await cleanup_deleted_files(
                    repo_id=self.ctx.repo_id,
                    repo_type=self.ctx.repo_type,
                    deleted_files=self.ctx.diff.delete,
                    new_commit_hash=self.ctx.new_commit_hash,
                    tree_repo=tree_repo,
                )
                await session.commit()

        async with new_session() as session:
            snapshot_repo = HfRepoSnapshotRepository(session)
            profile_repo = HfRepoProfileRepository(session)

            activated = await snapshot_repo.activate_snapshot(
                repo_id=self.ctx.repo_id,
                repo_type=self.ctx.repo_type,
                revision=self.ctx.revision,
                commit_hash=self.ctx.new_commit_hash,
            )
            if activated:
                logger.info(
                    "  -> Activated new snapshot {}@{} ({})",
                    self.ctx.repo_id,
                    self.ctx.revision,
                    self.ctx.new_commit_hash[:8],
                )

            if self.ctx.old_commit_hash:
                await snapshot_repo.archive_snapshot(
                    repo_id=self.ctx.repo_id,
                    repo_type=self.ctx.repo_type,
                    revision=self.ctx.revision,
                    archive_commit_hash=self.ctx.old_commit_hash,
                )
                logger.info(
                    "  -> Archived old snapshot {}@{} ({})",
                    self.ctx.repo_id,
                    self.ctx.revision,
                    self.ctx.old_commit_hash[:8],
                )

            await profile_repo.update_profile_on_cache(
                repo_id=self.ctx.repo_id,
                repo_type=self.ctx.repo_type,
                is_new_commit=True,
                pipeline_tag=self.ctx.pipeline_tag,
                new_status=RepoStatus.ACTIVE,
            )

            await session.commit()

        logger.info(
            "  -> Task completed: TaskId {} ({})", self._task.id, self.ctx.repo_id
        )

        await self._save_download_stats()
        await self._progress_tracker.complete_task()
        await self._progress_tracker.clear()

        logger.info("  -> Profile status set to ACTIVE for {}", self.ctx.repo_id)

    # ------------------------------------------------------------------
    # Abort / error recovery
    # ------------------------------------------------------------------

    async def _handle_abort(self, reason: str, error_msg: str) -> None:
        """Unified error recovery for cancelled/paused/failed tasks."""
        await self._save_download_stats()
        await self._fail_progress(error_msg)
        await self._cleanup_new_snapshot()
        await self._restore_profile(
            keep_active_on_commit_mismatch=(reason == "failed"),
        )

    async def _cleanup_new_snapshot(self) -> None:
        """Delete the INACTIVE snapshot and tree items created by this task."""
        if self._new_snapshot_id is None:
            return
        try:
            async with new_session() as session:
                snapshot_repo = HfRepoSnapshotRepository(session)
                await snapshot_repo.delete_snapshot_and_tree(
                    snapshot_id=self._new_snapshot_id,
                    commit_hash=self.ctx.new_commit_hash,
                )
                await session.commit()
            logger.info(
                "  -> Cleaned up INACTIVE snapshot {} for {}",
                self._new_snapshot_id,
                self.ctx.repo_id,
            )
        except Exception as e:
            logger.warning(
                "  -> Failed to clean up INACTIVE snapshot {}: {}",
                self._new_snapshot_id,
                e,
            )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _save_download_stats(self) -> tuple[int, int]:
        """Save download progress stats to the task row.

        Reads progress from Redis. If Redis is unavailable, falls back
        to the current DB values so real progress is not lost.
        """
        downloaded_file_count, downloaded_bytes = 0, 0
        redis_ok = False
        try:
            (
                downloaded_file_count,
                downloaded_bytes,
            ) = await self._progress_tracker.get_progress_snapshot()
            redis_ok = True
        except Exception:
            pass

        try:
            async with new_session() as session:
                task_repo = TaskRepository(session)
                if not redis_ok:
                    db_count, db_bytes = await task_repo.get_download_stats(
                        self._task.id
                    )
                    downloaded_file_count = downloaded_file_count or db_count
                    downloaded_bytes = downloaded_bytes or db_bytes
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
        except Exception as tracker_error:
            logger.warning("  -> Failed to update progress tracker: {}", tracker_error)

    async def _restore_profile(
        self, *, keep_active_on_commit_mismatch: bool = False
    ) -> None:
        """Restore profile status after a non-successful handler exit."""
        try:
            async with new_session() as session:
                profile_repo = HfRepoProfileRepository(session)
                snapshot_repo = HfRepoSnapshotRepository(session)

                existing_snapshot = await snapshot_repo.get_active_snapshot(
                    self.ctx.repo_id, self.ctx.repo_type, self.ctx.revision
                )

                if existing_snapshot:
                    if (
                        keep_active_on_commit_mismatch
                        and existing_snapshot.commit_hash != self.ctx.new_commit_hash
                    ):
                        logger.info(
                            "  -> Old snapshot still active for {}@{}, "
                            "keeping profile ACTIVE",
                            self.ctx.repo_id,
                            self.ctx.revision,
                        )
                        return
                    status = RepoStatus.ACTIVE
                else:
                    status = RepoStatus.INACTIVE

                await profile_repo.set_profile_status(
                    repo_id=self.ctx.repo_id,
                    repo_type=self.ctx.repo_type,
                    status=status,
                )
                await session.commit()
                logger.info(
                    "  -> Profile status set to {} for {}",
                    status.value,
                    self.ctx.repo_id,
                )
        except Exception as e:
            logger.error("  -> Failed to restore profile status: {}", e)

    def _cleanup_temp_dir(self) -> None:
        """Remove the temp directory for a repo download."""
        try:
            repo_dir = Path(settings.INCOMPLETE_FILE_PATH) / self.ctx.repo_id.replace(
                "/", "--"
            )
            if repo_dir.exists():
                shutil.rmtree(repo_dir)
                logger.info("  -> Cleaned up temp directory: {}", repo_dir)
        except Exception as cleanup_error:
            logger.warning("  -> Failed to clean up temp directory: {}", cleanup_error)


# ------------------------------------------------------------------
# Module-level entry point (keeps HandlerFunc / register_handlers compatible)
# ------------------------------------------------------------------


async def handle_download_huggingface(task: Task, task_control: TaskControl) -> None:
    """Create handler and execute the HF download workflow."""
    handler = HfDownloadHandler(task, task_control)
    await handler.execute()
