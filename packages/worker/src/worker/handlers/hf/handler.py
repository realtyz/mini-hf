"""HuggingFace download handler."""

from loguru import logger
from huggingface_hub import RepoFile
from services.config import ConfigService
from services.huggingface import HuggingfaceService, hf_url

from database import new_session, RepoStatus
from database.db_models import Task
from database.db_repositories import (
    HfRepoProfileRepository,
    HfRepoSnapshotRepository,
    HfRepoTreeRepository,
)
from worker.handlers.base import TaskControl
from worker.handlers.base_handler import BaseDownloadHandler
from worker.handlers.hf.adapter import (
    convert_cached_tree,
    convert_repo_file,
    convert_tree_items,
)
from worker.handlers.hf.cleanup import cleanup_deleted_files
from worker.handlers.diff_calculator import calculate_file_diff
from worker.handlers.hf.tree_saver import save_repo_tree
from worker.handlers.types import AuthHeaderBuilder, UrlBuilder


def _hf_auth_header_builder(access_token: str | None) -> dict[str, str] | None:
    """Build Authorization header for HuggingFace downloads."""
    if access_token:
        return {"Authorization": f"Bearer {access_token}"}
    return None


class HfDownloadHandler(BaseDownloadHandler):
    """HuggingFace-specific download handler.

    Implements the 6-phase workflow defined by BaseDownloadHandler,
    delegating to HF-specific services for commit resolution, tree
    fetching, and profile/snapshot management.
    """

    @property
    def source_name(self) -> str:
        return "HuggingFace"

    # ------------------------------------------------------------------
    # Phase 1: Profile preparation
    # ------------------------------------------------------------------

    async def prepare_profile(self) -> None:
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

    async def resolve_commit(self) -> None:
        """Resolve HF endpoint and commit hash, populate context fields."""
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

        # Store operator for use in calculate_diff
        self._operator = operator

    # ------------------------------------------------------------------
    # Phase 3: Diff calculation
    # ------------------------------------------------------------------

    async def calculate_diff(self) -> list:
        """Check existing snapshot, get new tree, and calculate file diff."""
        old_tree = []

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

        # Fetch tree from HF and convert to source-agnostic types
        raw_tree_items = await self._operator.get_tree(
            self.ctx.repo_id, self.ctx.repo_type, self.ctx.revision
        )
        new_source_files = [
            convert_repo_file(f) for f in raw_tree_items if isinstance(f, RepoFile)
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

        return raw_tree_items

    # ------------------------------------------------------------------
    # Phase 4: Save repo tree
    # ------------------------------------------------------------------

    async def save_tree(self, raw_tree_items: list) -> None:
        """Save snapshot and tree items to database."""
        source_tree_items = convert_tree_items(raw_tree_items)

        async with new_session() as session:
            snapshot_repo = HfRepoSnapshotRepository(session)
            tree_repo = HfRepoTreeRepository(session)
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
    # Phase 5: Download & upload
    # ------------------------------------------------------------------

    async def execute_downloads(self) -> None:
        """Download and upload files, then update cached status in DB."""
        successful_results = await self._run_file_processor(
            files_to_download=self.ctx.files_to_download,
            diff=self.ctx.diff,
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

    async def finalize_success(self) -> None:
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
    # Abort recovery
    # ------------------------------------------------------------------

    async def cleanup_new_snapshot(self) -> None:
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

    async def restore_profile(
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

    # ------------------------------------------------------------------
    # URL / auth builders
    # ------------------------------------------------------------------

    def build_url_builder(self) -> UrlBuilder:
        """Return a UrlBuilder for HuggingFace file downloads."""
        endpoint = self.ctx.endpoint

        def _builder(
            repo_id: str, repo_type: str, revision: str, file_path: str
        ) -> str:
            return hf_url(
                repo_id=repo_id,
                filename=file_path,
                repo_type=repo_type,
                revision=revision,
                endpoint=endpoint,
            )

        return _builder

    def build_auth_header_builder(self) -> AuthHeaderBuilder:
        """Return an AuthHeaderBuilder for HuggingFace downloads."""
        return _hf_auth_header_builder


# ------------------------------------------------------------------
# Module-level entry point (keeps HandlerFunc / register_handlers compatible)
# ------------------------------------------------------------------


async def handle_download_huggingface(task: Task, task_control: TaskControl) -> None:
    """Create handler and execute the HF download workflow."""
    handler = HfDownloadHandler(task, task_control)
    await handler.execute()
