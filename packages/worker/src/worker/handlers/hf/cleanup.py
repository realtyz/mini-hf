"""File cleanup operations for deleted files."""

from loguru import logger

from database.db_repositories import HfRepoTreeRepository
from storage import s3_client, build_blob_key


async def cleanup_deleted_files(
    repo_id: str,
    repo_type: str,
    deleted_files: list[tuple[str, str]],
    new_commit_hash: str,
    tree_repo: HfRepoTreeRepository,
) -> None:
    """Cleanup files that were deleted in the new commit.

    For each deleted file, directly delete from S3 without reference counting.
    Since we only allow deleting entire repos (not individual revisions),
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
