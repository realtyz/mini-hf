"""ModelScope adapter - converts ModelScope file tree dicts to source-agnostic types.

This module is the only place in the worker MS handler that knows about the
ModelScope file tree response shape (raw dicts from ModelScopeService).
All other handler modules work with the generic types from
worker.handlers.source_types.
"""

from __future__ import annotations

from loguru import logger

from database.db_models import MsRepoTreeItem
from worker.handlers.source_types import (
    CachedFileInfo,
    SourceFile,
    SourceFolder,
    SourceTreeItem,
)


def convert_ms_file_entry(entry: dict) -> SourceFile:
    """Convert a ModelScope file tree dict entry to a SourceFile.

    ModelScope entries have keys: Path, Type, Size, Sha256, BlobId, Revision.
    blob_id: prefer Sha256 (content-addressed), fallback to BlobId.
    """
    sha256 = entry.get("Sha256") or ""
    blob_id = entry.get("BlobId") or ""
    # LFS files use Sha256 as blob_id (content-addressed); regular files use BlobId
    content_id = sha256 or blob_id

    return SourceFile(
        path=entry.get("Path", ""),
        size=entry.get("Size", 0),
        blob_id=content_id,
        lfs_sha256=sha256 if sha256 else None,
        lfs_size=entry.get("Size") if sha256 else None,
        lfs_pointer_size=None,  # ModelScope has no LFS pointer file concept
    )


def convert_ms_folder_entry(entry: dict) -> SourceFolder:
    """Convert a ModelScope tree dict entry to a SourceFolder.

    ModelScope directory entries have no git tree object ID concept (git tree
    SHA is a HuggingFace LFS-side concept). The Revision field of a directory
    entry is the per-file commit SHA (the commit it lives in), not the ID of
    the directory object itself. Here we use Revision as tree_id only as a
    placeholder (to satisfy the SourceFolder.tree_id required field), stored
    into MsRepoTreeItem.oid column (comment: "blob_id for files, tree_id for
    folders").

    This oid has no real semantic use for directories:
    - cleanup.py's blob_exists_in_other_active_commits dedups by oid, but the
      delete list usually only contains files, directories are unaffected.
    - Directory uniqueness is enforced by the (commit_hash, path) unique
      constraint, not by oid.
    """
    return SourceFolder(
        path=entry.get("Path", ""),
        tree_id=entry.get("Revision") or entry.get("BlobId") or "",
    )


# Known ModelScope Type field values
_MS_KNOWN_TYPES = {"blob", "tree"}


def convert_ms_tree_entries(entries: list[dict]) -> list[SourceTreeItem]:
    """Convert a list of ModelScope tree dict entries to SourceTreeItem list.

    Unknown Type values log a warning and are skipped (the HF adapter uses
    isinstance for strong typing; the MS adapter is based on the string Type
    field and must defend against upstream schema drift).
    """
    result: list[SourceTreeItem] = []
    for entry in entries:
        entry_type = entry.get("Type", "")
        if entry_type == "blob":
            result.append(convert_ms_file_entry(entry))
        elif entry_type == "tree":
            result.append(convert_ms_folder_entry(entry))
        else:
            logger.warning(
                "Unknown ModelScope tree entry Type '{}' for path '{}', skipping",
                entry_type,
                entry.get("Path", ""),
            )
    return result


def convert_cached_file(item: MsRepoTreeItem) -> CachedFileInfo:
    """Convert a MsRepoTreeItem ORM object to a CachedFileInfo."""
    return CachedFileInfo(
        path=item.path,
        type=item.type.value if hasattr(item.type, "value") else item.type,
        is_cached=item.is_cached,
        oid=item.lfs_oid or item.oid,
        lfs_oid=item.lfs_oid,
    )


def convert_cached_tree(items: list[MsRepoTreeItem]) -> list[CachedFileInfo]:
    """Convert a list of MsRepoTreeItem to CachedFileInfo list."""
    return [convert_cached_file(item) for item in items]
