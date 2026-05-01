"""File cleanup operations for deleted files."""

import os
import time
from pathlib import Path

from loguru import logger

from core import settings
from database.db_repositories import HfRepoTreeRepository
from storage import s3_client, build_blob_key

INCOMPLETE_SUFFIX = ".incomplete"


async def cleanup_deleted_files(
    repo_id: str,
    repo_type: str,
    deleted_files: list[tuple[str, str]],
    new_commit_hash: str,
    tree_repo: HfRepoTreeRepository,
) -> None:
    """Cleanup files that were deleted in the new commit.

    For each deleted file, directly delete from S3 without reference counting.
    Since we only allow deleting entire repos (not individual versions),
    reference counting is no longer needed.
    """
    if not deleted_files:
        return

    deleted_count = 0
    for path, blob_id in deleted_files:
        # Check if blob is used by other active commits
        is_used_elsewhere = await tree_repo.blob_exists_in_other_active_commits(
            repo_id=repo_id,
            blob_id=blob_id,
            exclude_commit_hash=new_commit_hash,
        )

        if is_used_elsewhere:
            logger.debug(
                "  -> Blob still used elsewhere, keeping: {} ({})",
                path,
                blob_id[:12] if blob_id else "N/A",
            )
            continue

        # Delete from S3 directly (no reference counting)
        s3_key = build_blob_key(repo_id, repo_type, blob_id)
        try:
            await s3_client.delete_file(s3_key)
            deleted_count += 1
            logger.debug(
                "  -> Deleted from S3: {} ({})",
                path,
                blob_id[:12] if blob_id else "N/A",
            )
        except Exception as e:
            logger.warning("  -> Failed to delete {} from S3: {}", s3_key, e)

    if deleted_count > 0:
        logger.info("  -> Cleaned up {} orphaned files from S3", deleted_count)


def cleanup_stale_incomplete_files(
    max_age_seconds: int | None = None,
) -> int:
    """Remove stale .incomplete files and empty directories from the temp path.

    Called at worker startup to clean up leftover files from crashed/interrupted
    downloads. Files older than ``max_age_seconds`` are removed, then empty
    directories are pruned bottom-up.

    Args:
        max_age_seconds: Age threshold in seconds. Files modified more than
            this many seconds ago are considered stale and removed.

    Returns:
        Number of stale files removed.
    """
    if max_age_seconds is None:
        max_age_seconds = settings.WORKER_STALE_FILE_AGE_SECONDS

    incomplete_path = Path(settings.INCOMPLETE_FILE_PATH)
    if not incomplete_path.exists():
        return 0

    now = time.time()
    removed = 0
    scanned = 0

    for dirpath, dirnames, filenames in os.walk(incomplete_path, topdown=False):
        dir_path = Path(dirpath)
        for filename in filenames:
            if not filename.endswith(INCOMPLETE_SUFFIX):
                continue
            scanned += 1
            file_path = dir_path / filename
            try:
                file_age = now - file_path.stat().st_mtime
                if file_age > max_age_seconds:
                    file_path.unlink()
                    removed += 1
                    logger.debug("Removed stale incomplete file: {}", file_path)
            except OSError:
                pass

        # Log progress periodically for large temp directories
        if scanned > 0 and scanned % 500 == 0:
            logger.debug(
                "Cleanup scan progress: {} files scanned, {} removed...",
                scanned,
                removed,
            )

        for dirname in dirnames:
            sub_dir = dir_path / dirname
            try:
                if sub_dir.exists() and not any(sub_dir.iterdir()):
                    sub_dir.rmdir()
            except OSError:
                pass

    if removed > 0:
        logger.info("Cleaned up {} stale incomplete file(s)", removed)

    return removed
