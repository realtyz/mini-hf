"""File diff calculation for incremental updates."""

from dataclasses import dataclass

from worker.handlers.source_types import CachedFileInfo, SourceFile


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
                  These are brand new files that need to be downloaded.
                  Format: [SourceFile, ...]

        update: Files that exist in both commits but with different content (different blob_id).
                The old version needs cleanup and the new version needs to be downloaded.
                Format: [(old_blob_id, new_file), ...]

        delete: Files that exist in the old commit but have been removed in the new commit.
                These need cleanup to possibly delete from S3.
                Format: [(path, blob_id), ...]
    """

    keep: list[tuple[str, str]]  # [(path, blob_id), ...] - files to keep
    download: list[SourceFile]  # files to download (new)
    update: list[
        tuple[str, SourceFile]
    ]  # [(old_blob_id, new_file), ...] - files changed
    delete: list[tuple[str, str]]  # [(path, blob_id), ...] - files to delete


def calculate_file_diff(
    old_tree: list[CachedFileInfo],
    new_files: list[SourceFile],
) -> FileDiff:
    """Calculate file diff between old and new commit.

    Args:
        old_tree: Old commit tree items from database
        new_files: New commit files from source

    Returns:
        FileDiff with categorized file operations
    """
    # Build lookup maps - only consider cached files from old commit
    old_files = {
        item.path: item for item in old_tree if item.type == "file" and item.is_cached
    }
    new_files_map = {f.path: f for f in new_files}

    keep: list[tuple[str, str]] = []
    download: list[SourceFile] = []
    update: list[tuple[str, SourceFile]] = []
    delete: list[tuple[str, str]] = []

    # Compare new files against old
    for path, new_file in new_files_map.items():
        if not new_file.blob_id:
            continue

        if path not in old_files:
            download.append(new_file)
        else:
            old_file = old_files[path]
            old_blob_id = old_file.oid or ""

            if old_blob_id == new_file.blob_id:
                keep.append((path, new_file.blob_id))
            else:
                if old_blob_id:
                    update.append((old_blob_id, new_file))
                else:
                    download.append(new_file)

    # Find deleted files
    for path, old_file in old_files.items():
        if path not in new_files_map:
            old_blob_id = old_file.oid or ""
            if old_blob_id:
                delete.append((path, old_blob_id))

    return FileDiff(keep=keep, download=download, update=update, delete=delete)
