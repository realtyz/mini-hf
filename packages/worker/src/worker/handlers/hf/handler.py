"""Main HuggingFace download handler."""

import asyncio
import shutil
from pathlib import Path

from sqlalchemy import update

from services.huggingface import HuggingfaceService
from services.config import ConfigService
from huggingface_hub import RepoFile

from core import settings
from database.db_models import Task
from database import get_session, RepoStatus
from database.db_repositories import (
    HfRepoProfileRepository,
    HfRepoSnapshotRepository,
    HfRepoTreeRepository,
)
from loguru import logger

from worker.services import TaskProgressTracker

from .diff_calculator import calculate_file_diff
from .cleanup import cleanup_deleted_files
from .tree_saver import save_repo_tree
from .file_processor import download_and_upload_files


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
    """
    repo_id = task.repo_id
    repo_type = task.repo_type
    revision = task.revision
    access_token = task.access_token
    repo_items = task.repo_items or []

    # Initialize progress tracker
    progress_tracker = TaskProgressTracker(task.id)

    # Extract required file paths from repo_items
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

    # Initialize database session and repositories
    session = get_session()
    profile_repo = HfRepoProfileRepository(session)
    snapshot_repo = HfRepoSnapshotRepository(session)
    tree_repo = HfRepoTreeRepository(session)

    # Read HF endpoint configuration
    config_service = ConfigService(session)
    endpoints = await config_service.get_hf_endpoints()
    default_endpoint = await config_service.get_hf_default_endpoint()
    logger.info("  -> Using HF endpoint: {}", default_endpoint)

    try:
        # Step 1: Get or create profile, set status to UPDATING
        await profile_repo.get_or_create_profile(
            repo_id=repo_id,
            repo_type=repo_type,
            initial_status=RepoStatus.UPDATING,
        )
        logger.info("  -> Profile status set to UPDATING for {}", repo_id)

        # Step 2: Get repository info to determine commit_hash
        operator = HuggingfaceService(token=access_token, endpoint=default_endpoint)
        repo_info = await operator.get_repo_info(repo_id, repo_type, revision)
        new_commit_hash = repo_info.sha
        if not new_commit_hash:
            raise ValueError(f"Could not resolve commit_hash for {repo_id}@{revision}")
        logger.info(
            "  -> Resolved {}@{} -> commit {}",
            repo_id,
            revision,
            new_commit_hash[:8],
        )

        # Step 3: Check if this revision already has an active snapshot
        existing_snapshot = await snapshot_repo.get_active_snapshot(
            repo_id, repo_type, revision
        )

        if existing_snapshot:
            if existing_snapshot.commit_hash == new_commit_hash:
                # 3a. Same commit, no update needed
                logger.info(
                    "  -> Snapshot already active for {}@{} ({})",
                    repo_id,
                    revision,
                    new_commit_hash[:8],
                )
                return

            logger.info(
                "  -> Updating {}@{}: {} -> {}",
                repo_id,
                revision,
                existing_snapshot.commit_hash[:8],
                new_commit_hash[:8],
            )

            # 3b. Calculate file diff
            old_tree = await tree_repo.get_file_tree(existing_snapshot.commit_hash)
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

            # 3c. Filter files to download based on required_file_paths
            files_to_download = [
                f
                for f in diff.download + [item for _, item in diff.update]
                if f.path in required_file_paths
            ]

            # 3d. Save new tree items first (so set_item_cached can find records)
            # Note: save_repo_tree prepares data but doesn't commit - we commit here atomically
            await save_repo_tree(
                snapshot_repo=snapshot_repo,
                tree_repo=tree_repo,
                tree_items=new_tree_items,
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                commit_hash=new_commit_hash,
                committed_at=repo_info.last_modified,
            )
            # Commit snapshot and tree items atomically
            await session.commit()
            logger.info("  -> Committed snapshot and tree items for {}@{}", repo_id, new_commit_hash[:8])

            if files_to_download:
                logger.info(
                    "  -> Downloading {} files (filtered from {})",
                    len(files_to_download),
                    len(diff.download) + len(diff.update),
                )
                # Initialize progress tracking
                total_bytes = sum(f.size for f in files_to_download)
                await progress_tracker.init_task(
                    total_files=len(files_to_download),
                    total_bytes=total_bytes,
                )
                await download_and_upload_files(
                    repo_id=repo_id,
                    repo_type=repo_type,
                    commit_hash=new_commit_hash,
                    files=files_to_download,
                    access_token=access_token,
                    cancel_event=cancel_event,
                    tree_repo=tree_repo,
                    progress_tracker=progress_tracker,
                    endpoint=default_endpoint,
                )

            # 3e. Process deleted files (delete directly from S3, no reference counting)
            # Note: cleanup is done before activate, so even if it fails old snapshot can rollback
            await cleanup_deleted_files(
                repo_id=repo_id,
                repo_type=repo_type,
                deleted_files=diff.delete,
                new_commit_hash=new_commit_hash,
                tree_repo=tree_repo,
            )

            # 3f. Activate new snapshot (new snapshot files are now complete)
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

            # 3g. Archive old snapshot (last step, ensure new snapshot is fully ready)
            await snapshot_repo.archive_snapshot(
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                archive_commit_hash=existing_snapshot.commit_hash,
            )
            logger.info(
                "  -> Archived old snapshot {}@{} ({})",
                repo_id,
                revision,
                existing_snapshot.commit_hash[:8],
            )

        else:
            # Step 4: First download or revision doesn't exist
            logger.info(
                "  -> First time caching {}@{} ({})",
                repo_id,
                revision,
                new_commit_hash[:8],
            )

            # Get repository tree using RepoOperator
            tree_items = await operator.get_tree(repo_id, repo_type, revision)
            files = [f for f in tree_items if isinstance(f, RepoFile)]

            # Filter files to download
            files_to_download = [f for f in files if f.path in required_file_paths]

            # Save tree items first (so set_item_cached can find records)
            # Note: save_repo_tree prepares data but doesn't commit - we commit here atomically
            await save_repo_tree(
                snapshot_repo=snapshot_repo,
                tree_repo=tree_repo,
                tree_items=tree_items,
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                commit_hash=new_commit_hash,
                committed_at=repo_info.last_modified,
            )
            # Commit snapshot and tree items atomically
            await session.commit()
            logger.info("  -> Committed snapshot and tree items for {}@{}", repo_id, new_commit_hash[:8])

            # Then download files
            if files_to_download:
                logger.info(
                    "  -> Downloading {} files for new snapshot",
                    len(files_to_download),
                )
                # Initialize progress tracking
                total_bytes = sum(f.size for f in files_to_download)
                await progress_tracker.init_task(
                    total_files=len(files_to_download),
                    total_bytes=total_bytes,
                )
                await download_and_upload_files(
                    repo_id=repo_id,
                    repo_type=repo_type,
                    commit_hash=new_commit_hash,
                    files=files_to_download,
                    access_token=access_token,
                    cancel_event=cancel_event,
                    tree_repo=tree_repo,
                    progress_tracker=progress_tracker,
                    endpoint=default_endpoint,
                )

            # 4a. Activate new snapshot (first download, files are complete)
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

        logger.info("  -> Task completed: TaskId {} ({})", task.id, repo_id)

        # Task completed successfully, mark progress and cleanup
        (
            downloaded_file_count,
            downloaded_bytes,
        ) = await progress_tracker.get_progress_snapshot()
        await progress_tracker.complete_task()
        await progress_tracker.clear()

        # Save actual download stats to task
        await session.execute(
            update(Task)
            .where(Task.id == task.id)
            .values(
                downloaded_file_count=downloaded_file_count,
                downloaded_bytes=downloaded_bytes,
            )
        )
        await session.commit()

        # Step 5: Update profile status to ACTIVE, also update pipeline_tag
        pipeline_tag = getattr(repo_info, "pipeline_tag", None)
        await profile_repo.update_profile_on_cache(
            repo_id=repo_id,
            repo_type=repo_type,
            is_new_commit=True,  # Each update counts as new commit
            pipeline_tag=pipeline_tag,
            new_status=RepoStatus.ACTIVE,
        )
        logger.info("  -> Profile status set to ACTIVE for {}", repo_id)

    except Exception as e:
        # Download failed, mark task as failed and cleanup progress
        logger.error("  -> Download failed for {}: {}", repo_id, e)
        downloaded_file_count, downloaded_bytes = 0, 0
        try:
            (
                downloaded_file_count,
                downloaded_bytes,
            ) = await progress_tracker.get_progress_snapshot()
            await progress_tracker.fail_task(str(e))
            await progress_tracker.clear()
        except Exception as tracker_error:
            logger.warning("  -> Failed to update progress tracker: {}", tracker_error)

        # Save actual download stats to task
        try:
            await session.execute(
                update(Task)
                .where(Task.id == task.id)
                .values(
                    downloaded_file_count=downloaded_file_count,
                    downloaded_bytes=downloaded_bytes,
                )
            )
            await session.commit()
        except Exception as stats_error:
            logger.warning("  -> Failed to save downloaded stats: {}", stats_error)

        # Download failed, handle profile status based on situation
        try:
            # Check if old snapshot exists (for incremental update old commit)
            existing_snapshot = await snapshot_repo.get_active_snapshot(
                repo_id, repo_type, revision
            )

            if existing_snapshot and existing_snapshot.commit_hash != new_commit_hash:
                # Old snapshot is still active (and different from new commit),
                # meaning incremental update failed before archive
                # Keep ACTIVE status as old data is still available
                logger.info(
                    "  -> Old snapshot still active for {}@{}, keeping profile ACTIVE",
                    repo_id,
                    revision,
                )
            else:
                # No old data available (first download failed or old snapshot archived),
                # set to INACTIVE
                await profile_repo.set_profile_status(
                    repo_id=repo_id,
                    repo_type=repo_type,
                    status=RepoStatus.INACTIVE,
                )
                logger.info("  -> Profile status set to INACTIVE for {}", repo_id)

        except Exception as status_error:
            logger.error("  -> Failed to update profile status: {}", status_error)
        raise  # Re-raise exception for worker to handle task failure

    finally:
        await session.close()

        # Cleanup temp directory for this repo_id
        try:
            repo_dir = Path(settings.INCOMPLETE_FILE_PATH) / repo_id.replace("/", "--")
            if repo_dir.exists():
                shutil.rmtree(repo_dir)
                logger.info("  -> Cleaned up temp directory: {}", repo_dir)
        except Exception as cleanup_error:
            logger.warning("  -> Failed to clean up temp directory: {}", cleanup_error)
