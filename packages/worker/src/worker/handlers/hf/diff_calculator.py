"""File diff calculation for incremental updates."""

from dataclasses import dataclass

from database.db_models import HfRepoTreeItem
from huggingface_hub import RepoFile


@dataclass
class FileDiff:
    """File diff result between two commits.

    Used for incremental updates when a new commit is detected for a revision.
    Each field represents a category of file operations needed to transition
    from the old commit to the new commit.

    Fields:
        keep: Files that exist in both commits with identical content (same blob_id).
              Only considers cached files from the old commit (is_cached=True).
              These files are already in S3 and don't need to be re-downloaded.
              Format: [(path, blob_id), ...]

        download: Files that exist in the new commit but not in the old commit.
                  These are brand new files that need to be downloaded from HF Hub.
                  Format: [RepoFile, ...]

        update: Files that exist in both commits but with different content (different blob_id).
                The old version needs cleanup (possibly delete from S3 if not used by other commits)
                and the new version needs to be downloaded.
                Format: [(old_blob_id, new_file), ...]

        delete: Files that exist in the old commit but have been removed in the new commit.
                These need cleanup to possibly delete from S3 if not used by other commits.
                Format: [(path, blob_id), ...]
    """

    keep: list[tuple[str, str]]  # [(path, blob_id), ...] - files to keep
    download: list[RepoFile]  # files to download (new)
    update: list[tuple[str, RepoFile]]  # [(old_blob_id, new_file), ...] - files changed
    delete: list[tuple[str, str]]  # [(path, blob_id), ...] - files to delete


def calculate_file_diff(
    old_tree: list[HfRepoTreeItem],
    new_files: list[RepoFile],
) -> FileDiff:
    """Calculate file diff between old and new commit.

    Args:
        old_tree: Old commit tree items from database
        new_files: New commit files from HF Hub

    Returns:
        FileDiff with categorized file operations
    """
    # Build lookup maps - only consider cached files from old commit
    old_files = {
        item.path: item
        for item in old_tree
        if item.type.value == "file" and item.is_cached
    }
    new_files_map = {f.path: f for f in new_files}

    keep: list[tuple[str, str]] = []
    download: list[RepoFile] = []
    update: list[tuple[str, RepoFile]] = []
    delete: list[tuple[str, str]] = []

    # Compare new files against old
    for path, new_file in new_files_map.items():
        new_blob_id = new_file.lfs.sha256 if new_file.lfs else new_file.blob_id

        if not new_blob_id:
            # Skip files without blob_id
            continue

        if path not in old_files:
            # New file
            download.append(new_file)
        else:
            old_file = old_files[path]
            old_blob_id = old_file.lfs_oid if old_file.lfs_oid else old_file.oid

            if old_blob_id == new_blob_id:
                # Same file, keep
                keep.append((path, new_blob_id))
            else:
                # Changed file - store old blob_id for reference
                if old_blob_id:
                    update.append((old_blob_id, new_file))
                else:
                    # If old blob_id is None, treat as new download
                    download.append(new_file)

    # Find deleted files
    for path, old_file in old_files.items():
        if path not in new_files_map:
            old_blob_id = old_file.lfs_oid if old_file.lfs_oid else old_file.oid
            if old_blob_id:
                delete.append((path, old_blob_id))

    return FileDiff(keep=keep, download=download, update=update, delete=delete)
