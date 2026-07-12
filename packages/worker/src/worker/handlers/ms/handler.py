"""ModelScope download handler."""

from datetime import datetime, timezone

from loguru import logger
from services.config import ConfigService
from services.modelscope import ModelScopeService

from database import new_session, RepoStatus
from database.db_models import Task
from database.db_repositories import (
    MsRepoProfileRepository,
    MsRepoSnapshotRepository,
    MsRepoTreeRepository,
)
from worker.handlers.contracts import ExecutionResult, TaskControl
from worker.handlers.base_handler import BaseDownloadHandler
from worker.handlers.ms.adapter import (
    convert_cached_tree,
    convert_ms_file_entry,
    convert_ms_tree_entries,
)
from worker.handlers.ms.cleanup import cleanup_deleted_files
from worker.handlers.diff_calculator import calculate_file_diff
from worker.handlers.ms.tree_saver import save_repo_tree
from worker.handlers.source_types import AuthHeaderBuilder, BlobKeyBuilder, UrlBuilder


class MsDownloadHandler(BaseDownloadHandler):
    """ModelScope-specific download handler.

    Implements the 6-phase workflow defined by BaseDownloadHandler,
    delegating to ModelScopeService for commit resolution and tree
    fetching, and to MsRepo* repositories for profile/snapshot/tree
    management.
    """

    def __init__(self, task: Task, task_control: TaskControl):
        super().__init__(task, task_control)
        self._ms_service: ModelScopeService | None = None
        self._file_entries: list[dict] | None = None  # cached from resolve_commit

    @property
    def source_name(self) -> str:
        return "ModelScope"

    # ------------------------------------------------------------------
    # Phase 1: prepare_profile
    # ------------------------------------------------------------------

    async def prepare_profile(self) -> None:
        """Set profile status to UPDATING."""
        async with new_session() as session:
            profile_repo = MsRepoProfileRepository(session)
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
    # Phase 2: resolve_commit
    # ------------------------------------------------------------------

    async def resolve_commit(self) -> None:
        """Resolve MS endpoint and commit hash, populate context fields.

        Unlike the HF handler, the MS handler does not read task.hf_endpoint
        (that field's semantics do not apply to MS tasks). The endpoint is
        resolved from ConfigService.get_ms_default_endpoint(). ModelScope has
        no pipeline_tag concept, so ctx.pipeline_tag stays None.
        """
        async with new_session() as session:
            config_service = ConfigService(session)
            self.ctx.endpoint = await config_service.get_ms_default_endpoint()
        logger.info("  -> Using MS endpoint: {}", self.ctx.endpoint)

        self._ms_service = ModelScopeService(
            token=self.ctx.access_token, endpoint=self.ctx.endpoint
        )

        commit_hash, file_entries, committed_at_ts = (
            await self._ms_service.resolve_commit(
                self.ctx.repo_id, self.ctx.repo_type, self.ctx.revision
            )
        )

        self.ctx.new_commit_hash = commit_hash or ""
        self.ctx.committed_at = self._ts_to_datetime(committed_at_ts)
        # ModelScope has no pipeline_tag concept
        self.ctx.pipeline_tag = None

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

        # Cache file entries for calculate_diff (avoid second upstream request)
        self._file_entries = file_entries

    @staticmethod
    def _ts_to_datetime(ts: int | None) -> datetime | None:
        """Convert Unix timestamp (int) to naive UTC datetime."""
        if ts is None:
            return None
        return datetime.fromtimestamp(ts, tz=timezone.utc).replace(tzinfo=None)

    # ------------------------------------------------------------------
    # Phase 3: calculate_diff
    # ------------------------------------------------------------------

    async def calculate_diff(self) -> list:
        """Check existing snapshot, get new tree, and calculate file diff.

        Unlike the HF handler (which makes a second upstream request to fetch
        the tree), the MS handler reuses the file_entries cached during
        resolve_commit and converts them via the adapter.
        """
        old_tree = []

        async with new_session() as session:
            snapshot_repo = MsRepoSnapshotRepository(session)
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
                tree_repo = MsRepoTreeRepository(session)
                raw_old_tree = await tree_repo.get_file_tree(
                    existing_snapshot.commit_hash
                )
                old_tree = convert_cached_tree(raw_old_tree)
            else:
                logger.info(
                    "  -> First time caching {}@{} ({})",
                    self.ctx.repo_id,
                    self.ctx.revision,
                    self.ctx.new_commit_hash[:8],
                )

        if self._file_entries is None:
            raise RuntimeError("resolve_commit must be called before calculate_diff")

        # Convert MS dict entries to source-agnostic types
        new_source_files = [
            convert_ms_file_entry(entry)
            for entry in self._file_entries
            if entry.get("Type") == "blob"
        ]

        diff = calculate_file_diff(old_tree, new_source_files)
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

        # Return raw entries (blob + tree) for save_tree. calculate_file_diff
        # only consumes blob entries; save_tree needs the full list to persist
        # both files and directories.
        return self._file_entries

    # ------------------------------------------------------------------
    # Phase 4: save_tree
    # ------------------------------------------------------------------

    async def save_tree(self, raw_tree_items: list) -> None:
        """Save snapshot and tree items to database."""
        source_tree_items = convert_ms_tree_entries(raw_tree_items)

        async with new_session() as session:
            snapshot_repo = MsRepoSnapshotRepository(session)
            tree_repo = MsRepoTreeRepository(session)
            created = await save_repo_tree(
                session=session,
                snapshot_repo=snapshot_repo,
                tree_repo=tree_repo,
                tree_items=source_tree_items,
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
    # Phase 5: execute_downloads
    # ------------------------------------------------------------------

    async def execute_downloads(self) -> None:
        """Download and upload files, then update cached status in DB."""
        successful_results = await self._run_file_processor(
            files_to_download=self.ctx.files_to_download,
            diff=self.ctx.diff,
        )

        async with new_session() as session:
            tree_repo = MsRepoTreeRepository(session)
            for result in successful_results:
                await tree_repo.set_item_cached(
                    commit_hash=self.ctx.new_commit_hash,
                    path=result.path,
                )
            await session.commit()

    # ------------------------------------------------------------------
    # Phase 6: finalize_success
    # ------------------------------------------------------------------

    async def finalize_success(self) -> None:
        """Cleanup deleted files, activate snapshot, set profile ACTIVE."""
        if self.ctx.diff and self.ctx.diff.delete:
            async with new_session() as session:
                tree_repo = MsRepoTreeRepository(session)
                await cleanup_deleted_files(
                    repo_id=self.ctx.repo_id,
                    repo_type=self.ctx.repo_type,
                    deleted_files=self.ctx.diff.delete,
                    new_commit_hash=self.ctx.new_commit_hash,
                    tree_repo=tree_repo,
                )
                await session.commit()

        async with new_session() as session:
            snapshot_repo = MsRepoSnapshotRepository(session)
            profile_repo = MsRepoProfileRepository(session)

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
                pipeline_tag=None,  # ModelScope has no pipeline_tag
                new_status=RepoStatus.ACTIVE,
            )

            await session.commit()

        logger.info(
            "  -> Task completed: TaskId {} ({})", self._task.id, self.ctx.repo_id
        )

        await self._save_download_stats()
        await self._progress_tracker.complete_task()
        await self._progress_tracker.clear()
        await self._close_ms_service()  # explicitly release httpx connection pool

        logger.info("  -> Profile status set to ACTIVE for {}", self.ctx.repo_id)

    # ------------------------------------------------------------------
    # Abort recovery: cleanup_new_snapshot / _mark_successful_items_cached / restore_profile
    # ------------------------------------------------------------------

    async def cleanup_new_snapshot(self) -> None:
        """Delete the INACTIVE snapshot and tree items created by this task."""
        if self._new_snapshot_id is None:
            return
        try:
            async with new_session() as session:
                snapshot_repo = MsRepoSnapshotRepository(session)
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

    async def _mark_successful_items_cached(self) -> None:
        """Mark successfully downloaded tree items as cached after a failure."""
        if not self._successful_paths:
            return
        try:
            async with new_session() as session:
                tree_repo = MsRepoTreeRepository(session)
                for path in self._successful_paths:
                    await tree_repo.set_item_cached(
                        commit_hash=self.ctx.new_commit_hash,
                        path=path,
                    )
                await session.commit()
            logger.info(
                "  -> Marked {} items as cached for commit {} ({})",
                len(self._successful_paths),
                self.ctx.new_commit_hash[:8],
                self.ctx.repo_id,
            )
        except Exception as e:
            logger.warning(
                "  -> Failed to mark items as cached for commit {}: {}",
                self.ctx.new_commit_hash[:8],
                e,
            )

    async def restore_profile(
        self, *, keep_active_on_commit_mismatch: bool = False
    ) -> None:
        """Restore profile status after a non-successful handler exit.

        On failure (keep_active_on_commit_mismatch=True): activate the
        partial snapshot and set profile ACTIVE so that successfully
        downloaded files are immediately accessible.

        On cancel/pause (keep_active_on_commit_mismatch=False): revert
        to the old snapshot if one exists, otherwise mark INACTIVE.
        """
        try:
            async with new_session() as session:
                profile_repo = MsRepoProfileRepository(session)
                snapshot_repo = MsRepoSnapshotRepository(session)

                existing_snapshot = await snapshot_repo.get_active_snapshot(
                    self.ctx.repo_id, self.ctx.repo_type, self.ctx.revision
                )

                if keep_active_on_commit_mismatch:
                    # ── Failure: mark profile & new snapshot ACTIVE ──
                    if (
                        existing_snapshot
                        and existing_snapshot.commit_hash != self.ctx.new_commit_hash
                    ):
                        # Archive the old snapshot and activate the new
                        # (partial) one so downloaded files are accessible.
                        await snapshot_repo.archive_snapshot(
                            repo_id=self.ctx.repo_id,
                            repo_type=self.ctx.repo_type,
                            revision=self.ctx.revision,
                            archive_commit_hash=existing_snapshot.commit_hash,
                        )
                        await snapshot_repo.activate_snapshot(
                            repo_id=self.ctx.repo_id,
                            repo_type=self.ctx.repo_type,
                            revision=self.ctx.revision,
                            commit_hash=self.ctx.new_commit_hash,
                        )
                        logger.info(
                            "  -> Activated partial snapshot {}@{} on failure, "
                            "archived old {}",
                            self.ctx.repo_id,
                            self.ctx.new_commit_hash[:8],
                            existing_snapshot.commit_hash[:8],
                        )
                    elif existing_snapshot is None:
                        # First download failed: activate the partial snapshot.
                        await snapshot_repo.activate_snapshot(
                            repo_id=self.ctx.repo_id,
                            repo_type=self.ctx.repo_type,
                            revision=self.ctx.revision,
                            commit_hash=self.ctx.new_commit_hash,
                        )
                        logger.info(
                            "  -> Activated partial snapshot {}@{} on failure "
                            "(first download)",
                            self.ctx.repo_id,
                            self.ctx.new_commit_hash[:8],
                        )

                    await profile_repo.set_profile_status(
                        repo_id=self.ctx.repo_id,
                        repo_type=self.ctx.repo_type,
                        status=RepoStatus.ACTIVE,
                    )
                    await session.commit()
                    logger.info(
                        "  -> Profile status set to ACTIVE for {} (failure recovery)",
                        self.ctx.repo_id,
                    )
                else:
                    # ── Cancel / Pause: revert to old state ──
                    if existing_snapshot:
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
        finally:
            await self._close_ms_service()

    async def _close_ms_service(self) -> None:
        """Close the ModelScopeService httpx client if open.

        Idempotent: safe to call multiple times (no-op when service is None).
        Called at the end of both finalize_success (success path) and
        restore_profile's finally block (abort path), covering all
        non-exception exits.
        """
        if self._ms_service is not None:
            try:
                await self._ms_service.close()
            except Exception as e:
                logger.warning("  -> Failed to close ModelScopeService: {}", e)
            finally:
                self._ms_service = None

    # ------------------------------------------------------------------
    # URL / auth / blob-key builders
    # ------------------------------------------------------------------

    def build_url_builder(self) -> UrlBuilder:
        """Return a UrlBuilder for ModelScope file downloads.

        NOTE: The revision parameter passed by the file processor is
        ctx.commit_hash (resolved SHA or pseudo_commit). For ModelScope
        download URLs, we must use the original revision (branch/tag) the
        user requested, because pseudo_commit is not recognized by upstream.
        See design note D1.
        """
        ms_service = self._ms_service
        assert ms_service is not None, (
            "resolve_commit must be called before build_url_builder"
        )
        orig_revision = self.ctx.revision

        def _builder(
            repo_id: str, repo_type: str, revision: str, file_path: str
        ) -> str:
            # revision param is ctx.commit_hash -- ignore it, use orig_revision
            return ms_service.build_file_url(
                repo_id, repo_type, orig_revision, file_path
            )

        return _builder

    def build_auth_header_builder(self) -> AuthHeaderBuilder:
        """Return an AuthHeaderBuilder for ModelScope downloads.

        ModelScopeService.build_auth_headers returns a dict (empty for no
        token). The AuthHeaderBuilder protocol expects dict | None. Convert
        empty -> None to align with the HF builder's semantics.
        """
        ms_service = self._ms_service
        assert ms_service is not None, (
            "resolve_commit must be called before build_auth_header_builder"
        )

        def _builder(access_token: str | None) -> dict[str, str] | None:
            return ms_service.build_auth_headers(access_token) or None

        return _builder

    def build_blob_key_builder(self) -> BlobKeyBuilder:
        """Return a BlobKeyBuilder for ModelScope S3 keys (ms/ prefix)."""
        from storage import build_ms_blob_key

        return lambda repo_id, repo_type, blob_id: build_ms_blob_key(
            repo_id, repo_type, blob_id
        )


# ------------------------------------------------------------------
# Module-level entry point (keeps HandlerFunc / register_handlers compatible)
# ------------------------------------------------------------------


async def handle_download_modelscope(
    task: Task, task_control: TaskControl
) -> ExecutionResult:
    """Create handler and execute the MS download workflow."""
    handler = MsDownloadHandler(task, task_control)
    return await handler.execute()
