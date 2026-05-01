"""Source-agnostic type definitions for download handlers.

These types decouple the worker handler logic from specific source SDKs
(e.g. huggingface_hub.RepoFile) so that the same download pipeline can
be reused for HuggingFace, ModelScope, or any other model hub.
"""

from dataclasses import dataclass
from typing import Protocol


# ------------------------------------------------------------------
# File / folder descriptors (replace source-specific SDK types)
# ------------------------------------------------------------------


@dataclass(frozen=True)
class SourceFile:
    """Source-agnostic file descriptor.

    Each source adapter is responsible for converting its native file
    type (e.g. huggingface_hub.RepoFile) into this format.
    """

    path: str
    size: int
    blob_id: str  # unique content identifier (sha256 for LFS, blob_id otherwise)

    # LFS metadata — None for non-LFS files
    lfs_sha256: str | None = None
    lfs_size: int | None = None
    lfs_pointer_size: int | None = None


@dataclass(frozen=True)
class SourceFolder:
    """Source-agnostic folder descriptor."""

    path: str
    tree_id: str  # directory object ID


SourceTreeItem = SourceFile | SourceFolder
"""A single item in a repository tree listing."""


# ------------------------------------------------------------------
# Cached file info (replaces direct HfRepoTreeItem dependency)
# ------------------------------------------------------------------


@dataclass(frozen=True)
class CachedFileInfo:
    """Read-only view of a cached file record from the database.

    Used by the diff calculator to compare old (cached) files against
    new source files. Each source adapter converts its DB model into
    this format.
    """

    path: str
    type: str  # "file" or "directory"
    is_cached: bool | None
    oid: str | None  # blob_id for files, tree_id for folders
    lfs_oid: str | None = None


# ------------------------------------------------------------------
# URL builder protocol
# ------------------------------------------------------------------


class UrlBuilder(Protocol):
    """Callable that produces a download URL for a given file path."""

    def __call__(
        self,
        repo_id: str,
        repo_type: str,
        revision: str,
        file_path: str,
    ) -> str: ...


# ------------------------------------------------------------------
# Auth header builder
# ------------------------------------------------------------------


class AuthHeaderBuilder(Protocol):
    """Callable that produces HTTP headers for authenticated downloads."""

    def __call__(self, access_token: str | None) -> dict[str, str] | None: ...
