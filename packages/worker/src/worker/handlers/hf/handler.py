"""Main HuggingFace download handler."""

import asyncio
import shutil
from pathlib import Path

from services.huggingface import HuggingfaceService
from services.config import ConfigService
from huggingface_hub import RepoFile

from core import settings
from database import get_session, RepoStatus
from database.db_models import Task
from database.db_repositories import (
    HfRepoProfileRepository,
    HfRepoSnapshotRepository,
    HfRepoTreeRepository,
    TaskRepository,
)
from loguru import logger

from worker.services import TaskProgressTracker

from .diff_calculator import calculate_file_diff
from .cleanup import cleanup_deleted_files
from .tree_saver import save_repo_tree
from .file_processor import download_and_upload_files
from .._downloader import DownloadCancelledError


async def _save_download_stats(
    task_id: int,
    progress_tracker: TaskProgressTracker,
) -> tuple[int, int]:
    """Save download progress stats to the task row.

    Returns (downloaded_file_count, downloaded_bytes) even if saving fails.
    """
    downloaded_file_count, downloaded_bytes = 0, 0
    try:
        (
            downloaded_file_count,
            downloaded_bytes,
        ) = await progress_tracker.get_progress_snapshot()
    except Exception:
        pass

    try:
        async with get_session() as session:
            task_repo = TaskRepository(session)
            await task_repo.update_download_stats(
                task_id=task_id,
                downloaded_file_count=downloaded_file_count,
                downloaded_bytes=downloaded_bytes,
            )
    except Exception as stats_error:
        logger.warning("  -> Failed to save downloaded stats: {}", stats_error)

    return downloaded_file_count, downloaded_bytes


async def _fail_progress(
    progress_tracker: TaskProgressTracker,
    message: str,
) -> None:
    """Mark the progress tracker as failed and clear it."""
    try:
        await progress_tracker.fail_task(message)
        await progress_tracker.clear()
    except Exception as tracker_error:
        logger.warning("  -> Failed to update progress tracker: {}", tracker_error)


async def _restore_profile_on_cancel(
    *,
    repo_id: str,
    repo_type: str,
    revision: str,
    new_commit_hash: str,
    profile_repo: HfRepoProfileRepository,
    snapshot_repo: HfRepoSnapshotRepository,
) -> None:
    """Restore profile status to ACTIVE or INACTIVE on cancellation."""
    try:
        existing_snapshot = await snapshot_repo.get_active_snapshot(
            repo_id, repo_type, revision
        )

        if existing_snapshot:
            await profile_repo.set_profile_status(
                repo_id=repo_id,
                repo_type=repo_type,
                status=RepoStatus.ACTIVE,
            )
            logger.info(
                "  -> Restored profile status to ACTIVE for {} (old snapshot exists)",
                repo_id,
            )
        else:
            await profile_repo.set_profile_status(
                repo_id=repo_id,
                repo_type=repo_type,
                status=RepoStatus.INACTIVE,
            )
            logger.info(
                "  -> Set profile status to INACTIVE for {} (first download cancelled)",
                repo_id,
            )
    except Exception as status_error:
        logger.error(
            "  -> Failed to restore profile status on cancellation: {}", status_error
        )


async def _restore_profile_on_failure(
    *,
    repo_id: str,
    repo_type: str,
    revision: str,
    new_commit_hash: str,
    profile_repo: HfRepoProfileRepository,
    snapshot_repo: HfRepoSnapshotRepository,
) -> None:
    """Restore profile status to ACTIVE or INACTIVE on download failure."""
    try:
        existing_snapshot = await snapshot_repo.get_active_snapshot(
            repo_id, repo_type, revision
        )

        if existing_snapshot and existing_snapshot.commit_hash != new_commit_hash:
            logger.info(
                "  -> Old snapshot still active for {}@{}, keeping profile ACTIVE",
                repo_id,
                revision,
            )
        else:
            await profile_repo.set_profile_status(
                repo_id=repo_id,
                repo_type=repo_type,
                status=RepoStatus.INACTIVE,
            )
            logger.info("  -> Profile status set to INACTIVE for {}", repo_id)
    except Exception as status_error:
        logger.error("  -> Failed to update profile status: {}", status_error)


async def _restore_profile_on_cancel_externally(
    *,
    repo_id: str,
    repo_type: str,
    revision: str,
    new_commit_hash: str,
) -> None:
    """Restore profile status on cancellation using a fresh session."""
    try:
        async with get_session() as session:
            profile_repo = HfRepoProfileRepository(session)
            snapshot_repo = HfRepoSnapshotRepository(session)
            await _restore_profile_on_cancel(
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                new_commit_hash=new_commit_hash,
                profile_repo=profile_repo,
                snapshot_repo=snapshot_repo,
            )
    except Exception as e:
        logger.error("  -> Failed to restore profile status on cancellation: {}", e)


async def _restore_profile_on_failure_externally(
    *,
    repo_id: str,
    repo_type: str,
    revision: str,
    new_commit_hash: str,
) -> None:
    """Restore profile status on failure using a fresh session."""
    try:
        async with get_session() as session:
            profile_repo = HfRepoProfileRepository(session)
            snapshot_repo = HfRepoSnapshotRepository(session)
            await _restore_profile_on_failure(
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                new_commit_hash=new_commit_hash,
                profile_repo=profile_repo,
                snapshot_repo=snapshot_repo,
            )
    except Exception as e:
        logger.error("  -> Failed to restore profile status on failure: {}", e)


async def handle_download_huggingface(task: Task, cancel_event: asyncio.Event) -> None:
    """Handle download task from HuggingFace.

    This handler downloads a model/dataset from HuggingFace Hub:
    1. Get repository file tree using RepoOperator
    2. Check for existing active snapshot and calculate diff
    3. Download only changed/new files
    4. Upload to S3 storage
    5. Save repository metadata to database
    6. Archive old snapshot and cleanup orphaned files

    Status flow:
    - On start: create/update profile with UPDATING status
    - On success: set status to ACTIVE
    - On failure: set status to INACTIVE

    Database sessions are kept short — only held during DB operations,
    released during network I/O (downloading from HF, uploading to S3).
    """
    repo_id = task.repo_id
    repo_type = task.repo_type
    revision = task.revision
    access_token = task.access_token
    repo_items = task.repo_items or []

    progress_tracker = TaskProgressTracker(task.id)
    new_commit_hash: str = ""

    required_file_paths = {
        item["path"] for item in repo_items if item.get("required", True)
    }
    if not required_file_paths:
        raise ValueError(
            "At least one file must be selected for download (required=true)"
        )

    logger.info("  -> Downloading from HuggingFace: {} (type: {})", repo_id, repo_type)
    if access_token:
        logger.info("  -> Using provided access token")
    logger.info(
        "  -> Files to download: {}/{}", len(required_file_paths), len(repo_items)
    )

    try:
        # Step 1: Set profile status to UPDATING (short DB session)
        async with get_session() as session:
            profile_repo = HfRepoProfileRepository(session)
            repo_type_str = repo_type

            await profile_repo.get_or_create_profile(
                repo_id=repo_id,
                repo_type=repo_type_str,
                initial_status=RepoStatus.UPDATING,
            )
            await profile_repo.set_profile_status(
                repo_id=repo_id,
                repo_type=repo_type_str,
                status=RepoStatus.UPDATING,
            )
            logger.info("  -> Profile status set to UPDATING for {}", repo_id)

        # Step 2: Resolve commit hash (network call, no DB session needed)
        async with get_session() as session:
            config_service = ConfigService(session)
            endpoint = (
                task.hf_endpoint or await config_service.get_hf_default_endpoint()
            )
        logger.info("  -> Using HF endpoint: {}", endpoint)

        operator = HuggingfaceService(token=access_token, endpoint=endpoint)
        repo_info = await operator.get_repo_info(repo_id, repo_type, revision)
        new_commit_hash = repo_info.sha or ""
        if not new_commit_hash:
            raise ValueError(f"Could not resolve commit_hash for {repo_id}@{revision}")
        logger.info(
            "  -> Resolved {}@{} -> commit {}",
            repo_id,
            revision,
            new_commit_hash[:8],
        )

        # Step 3: Check for existing active snapshot (short DB session)
        async with get_session() as session:
            snapshot_repo = HfRepoSnapshotRepository(session)
            existing_snapshot = await snapshot_repo.get_active_snapshot(
                repo_id, repo_type, revision
            )

        # Step 4: Download files (shared logic for both paths)
        files_to_download: list[RepoFile]
        old_commit_hash: str | None = None

        if existing_snapshot:
            # Incremental update
            logger.info(
                "  -> Updating {}@{}: {} -> {}",
                repo_id,
                revision,
                existing_snapshot.commit_hash[:8],
                new_commit_hash[:8],
            )
            old_commit_hash = existing_snapshot.commit_hash

            # Get old tree from DB
            async with get_session() as session:
                tree_repo = HfRepoTreeRepository(session)
                old_tree = await tree_repo.get_file_tree(existing_snapshot.commit_hash)

            # Get new tree from HF
            new_tree_items = await operator.get_tree(repo_id, repo_type, revision)
            new_files = [f for f in new_tree_items if isinstance(f, RepoFile)]

            diff = calculate_file_diff(old_tree, new_files)
            logger.info(
                "  -> File diff: {} keep, {} download, {} update, {} delete",
                len(diff.keep),
                len(diff.download),
                len(diff.update),
                len(diff.delete),
            )

            files_to_download = [
                f
                for f in diff.download + [item for _, item in diff.update]
                if f.path in required_file_paths
            ]

            # Save tree to DB
            async with get_session() as session:
                snapshot_repo = HfRepoSnapshotRepository(session)
                tree_repo = HfRepoTreeRepository(session)
                await save_repo_tree(
                    session=session,
                    snapshot_repo=snapshot_repo,
                    tree_repo=tree_repo,
                    tree_items=new_tree_items,
                    repo_id=repo_id,
                    repo_type=repo_type,
                    revision=revision,
                    commit_hash=new_commit_hash,
                    committed_at=repo_info.last_modified,
                )
                logger.info(
                    "  -> Saved snapshot and tree items for {}@{}",
                    repo_id,
                    new_commit_hash[:8],
                )

            if files_to_download:
                logger.info(
                    "  -> Downloading {} files (filtered from {})",
                    len(files_to_download),
                    len(diff.download) + len(diff.update),
                )
                total_bytes = sum(f.size for f in files_to_download)
                await progress_tracker.init_task(
                    total_files=len(files_to_download),
                    total_bytes=total_bytes,
                )
                # Pure IO — no DB session held during download/upload
                successful_results = await download_and_upload_files(
                    repo_id=repo_id,
                    repo_type=repo_type,
                    commit_hash=new_commit_hash,
                    files=files_to_download,
                    access_token=access_token,
                    cancel_event=cancel_event,
                    progress_tracker=progress_tracker,
                    endpoint=endpoint,
                )
                # Update DB with cached status (short session)
                async with get_session() as session:
                    tree_repo = HfRepoTreeRepository(session)
                    for result in successful_results:
                        await tree_repo.set_item_cached(
                            commit_hash=new_commit_hash,
                            path=result["path"],
                        )

            # Cleanup deleted files (involves both DB and S3)
            async with get_session() as session:
                tree_repo = HfRepoTreeRepository(session)
                await cleanup_deleted_files(
                    repo_id=repo_id,
                    repo_type=repo_type,
                    deleted_files=diff.delete,
                    new_commit_hash=new_commit_hash,
                    tree_repo=tree_repo,
                )

            await _activate_and_archive(
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                new_commit_hash=new_commit_hash,
                old_commit_hash=old_commit_hash,
            )

        else:
            # First download
            logger.info(
                "  -> First time caching {}@{} ({})",
                repo_id,
                revision,
                new_commit_hash[:8],
            )

            # Get tree from HF (network call, no DB session)
            tree_items = await operator.get_tree(repo_id, repo_type, revision)
            files = [f for f in tree_items if isinstance(f, RepoFile)]
            files_to_download = [f for f in files if f.path in required_file_paths]

            # Save tree to DB (short session)
            async with get_session() as session:
                snapshot_repo = HfRepoSnapshotRepository(session)
                tree_repo = HfRepoTreeRepository(session)
                await save_repo_tree(
                    session=session,
                    snapshot_repo=snapshot_repo,
                    tree_repo=tree_repo,
                    tree_items=tree_items,
                    repo_id=repo_id,
                    repo_type=repo_type,
                    revision=revision,
                    commit_hash=new_commit_hash,
                    committed_at=repo_info.last_modified,
                )
                logger.info(
                    "  -> Saved snapshot and tree items for {}@{}",
                    repo_id,
                    new_commit_hash[:8],
                )

            if files_to_download:
                logger.info(
                    "  -> Downloading {} files for new snapshot",
                    len(files_to_download),
                )
                total_bytes = sum(f.size for f in files_to_download)
                await progress_tracker.init_task(
                    total_files=len(files_to_download),
                    total_bytes=total_bytes,
                )
                # Pure IO — no DB session held during download/upload
                successful_results = await download_and_upload_files(
                    repo_id=repo_id,
                    repo_type=repo_type,
                    commit_hash=new_commit_hash,
                    files=files_to_download,
                    access_token=access_token,
                    cancel_event=cancel_event,
                    progress_tracker=progress_tracker,
                    endpoint=endpoint,
                )
                # Update DB with cached status (short session)
                async with get_session() as session:
                    tree_repo = HfRepoTreeRepository(session)
                    for result in successful_results:
                        await tree_repo.set_item_cached(
                            commit_hash=new_commit_hash,
                            path=result["path"],
                        )

            await _activate_and_archive(
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                new_commit_hash=new_commit_hash,
                old_commit_hash=None,
            )

        logger.info("  -> Task completed: TaskId {} ({})", task.id, repo_id)

        # Save final download stats (short DB session)
        await progress_tracker.complete_task()
        await progress_tracker.clear()
        await _save_download_stats(task.id, progress_tracker)

        # Update profile status to ACTIVE (short DB session)
        async with get_session() as session:
            profile_repo = HfRepoProfileRepository(session)
            pipeline_tag = getattr(repo_info, "pipeline_tag", None)
            await profile_repo.update_profile_on_cache(
                repo_id=repo_id,
                repo_type=repo_type,
                is_new_commit=True,
                pipeline_tag=pipeline_tag,
                new_status=RepoStatus.ACTIVE,
            )
            logger.info("  -> Profile status set to ACTIVE for {}", repo_id)

    except DownloadCancelledError:
        logger.info("  -> Download cancelled by user for {}", repo_id)
        await _fail_progress(progress_tracker, "Cancelled by user")
        await _save_download_stats(task.id, progress_tracker)
        await _restore_profile_on_cancel_externally(
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
            new_commit_hash=new_commit_hash,
        )
        raise

    except Exception as e:
        logger.exception("  -> Download failed for {}: {}", repo_id, e)
        await _fail_progress(progress_tracker, str(e))
        await _save_download_stats(task.id, progress_tracker)
        await _restore_profile_on_failure_externally(
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
            new_commit_hash=new_commit_hash,
        )
        raise

    finally:
        try:
            repo_dir = Path(settings.INCOMPLETE_FILE_PATH) / repo_id.replace("/", "--")
            if repo_dir.exists():
                shutil.rmtree(repo_dir)
                logger.info("  -> Cleaned up temp directory: {}", repo_dir)
        except Exception as cleanup_error:
            logger.warning("  -> Failed to clean up temp directory: {}", cleanup_error)


async def _activate_and_archive(
    *,
    repo_id: str,
    repo_type: str,
    revision: str,
    new_commit_hash: str,
    old_commit_hash: str | None,
) -> None:
    """Activate the new snapshot and optionally archive the old one.

    Uses a short-lived database session for these quick DB operations.
    """
    async with get_session() as session:
        snapshot_repo = HfRepoSnapshotRepository(session)
        activated = await snapshot_repo.activate_snapshot(
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
            commit_hash=new_commit_hash,
        )
        if activated:
            logger.info(
                "  -> Activated new snapshot {}@{} ({})",
                repo_id,
                revision,
                new_commit_hash[:8],
            )

        if old_commit_hash:
            await snapshot_repo.archive_snapshot(
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                archive_commit_hash=old_commit_hash,
            )
            logger.info(
                "  -> Archived old snapshot {}@{} ({})",
                repo_id,
                revision,
                old_commit_hash[:8],
            )
