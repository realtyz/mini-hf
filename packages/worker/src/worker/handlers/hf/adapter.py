"""HuggingFace adapter — converts HF SDK types to source-agnostic types.

This module is the *only* place in the worker that imports from
huggingface_hub. All other handler modules work with the generic
types from worker.handlers.types.
"""

from __future__ import annotations

from services.huggingface import RepoFile, RepoFolder

from database.db_models import HfRepoTreeItem
from worker.handlers.types import (
    CachedFileInfo,
    SourceFile,
    SourceFolder,
    SourceTreeItem,
)


# ------------------------------------------------------------------
# Source tree conversion: RepoFile / RepoFolder → SourceFile / SourceFolder
# ------------------------------------------------------------------


def convert_repo_file(f: RepoFile) -> SourceFile:
    """Convert a huggingface_hub.RepoFile to a SourceFile."""
    lfs_sha256 = f.lfs.sha256 if f.lfs else None
    # blob_id: prefer LFS sha256 for content-addressing, fallback to blob_id
    blob_id = lfs_sha256 or f.blob_id or ""

    return SourceFile(
        path=f.path,
        size=f.size,
        blob_id=blob_id,
        lfs_sha256=lfs_sha256,
        lfs_size=f.lfs.size if f.lfs else None,
        lfs_pointer_size=f.lfs.pointer_size if f.lfs else None,
    )


def convert_repo_folder(f: RepoFolder) -> SourceFolder:
    """Convert a huggingface_hub.RepoFolder to a SourceFolder."""
    return SourceFolder(path=f.path, tree_id=f.tree_id)


def convert_tree_items(items: list) -> list[SourceTreeItem]:
    """Convert a mixed list of RepoFile/RepoFolder to SourceTreeItem list."""
    result: list[SourceTreeItem] = []
    for item in items:
        if isinstance(item, RepoFile):
            result.append(convert_repo_file(item))
        elif isinstance(item, RepoFolder):
            result.append(convert_repo_folder(item))
    return result


# ------------------------------------------------------------------
# Cached file conversion: HfRepoTreeItem → CachedFileInfo
# ------------------------------------------------------------------


def convert_cached_file(item: HfRepoTreeItem) -> CachedFileInfo:
    """Convert a HfRepoTreeItem ORM object to a CachedFileInfo."""
    return CachedFileInfo(
        path=item.path,
        type=item.type.value if hasattr(item.type, "value") else item.type,
        is_cached=item.is_cached,
        oid=item.lfs_oid or item.oid,
        lfs_oid=item.lfs_oid,
    )


def convert_cached_tree(items: list[HfRepoTreeItem]) -> list[CachedFileInfo]:
    """Convert a list of HfRepoTreeItem to CachedFileInfo list."""
    return [convert_cached_file(item) for item in items]
