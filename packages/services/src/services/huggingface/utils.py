"""Utility functions for HuggingFace Hub operations."""

import re
from fnmatch import fnmatch
from pathlib import Path
from typing import Callable, Generator, Iterable, Optional, TypeVar
from urllib.parse import quote

from huggingface_hub import hf_hub_url

T = TypeVar("T")

# Regex to match commit hash (40 hex characters)
REGEX_COMMIT_HASH = re.compile(r"^[0-9a-f]{40}$")


def is_commit_hash(revision: str) -> bool:
    """Check if a revision string is a commit hash.

    A commit hash is a 40-character hexadecimal string.

    Args:
        revision: The revision string to check (e.g., "main", "a1b2c3d4...")

    Returns:
        True if the revision is a commit hash, False otherwise.

    Example:
        >>> is_commit_hash("main")
        False
        >>> is_commit_hash("a1b2c3d4e5f6789012345678901234567890abcd")
        True
    """
    return bool(REGEX_COMMIT_HASH.match(revision))


def hf_url(
    repo_id: str,
    filename: str,
    *,
    repo_type: str = "model",
    revision: str = "main",
    endpoint: str | None = None,
) -> str:
    """Generate HuggingFace file download URL.

    This function uses huggingface_hub.hf_hub_url() for full compatibility
    with HF Hub features including custom endpoints.

    Args:
        repo_id: Repository ID (e.g., "bert-base-uncased").
        filename: File path relative to repo root.
        repo_type: Repository type ("model", "dataset", or "space").
        revision: Git revision (branch, tag, or commit hash).
        endpoint: Custom HuggingFace endpoint URL (e.g., "https://hf-mirror.com").

    Returns:
        Full download URL for the file.

    Example:
        >>> hf_url("bert-base-uncased", "config.json")
        "https://huggingface.co/bert-base-uncased/resolve/main/config.json"
        >>> hf_url("bert-base-uncased", "config.json", endpoint="https://hf-mirror.com")
        "https://hf-mirror.com/bert-base-uncased/resolve/main/config.json"
    """
    return hf_hub_url(
        repo_id=repo_id,
        filename=filename,
        repo_type=repo_type,
        revision=revision,
        endpoint=endpoint,
    )


def hf_url_simple(repo_id: str, file_path: str, revision: str = "main") -> str:
    """Generate simple HuggingFace file download URL.

    This is a lightweight alternative to hf_url() that doesn't require
    huggingface_hub. Useful for simple cases with the default endpoint.

    Args:
        repo_id: Repository ID (e.g., "bert-base-uncased").
        file_path: File path relative to repo root.
        revision: Git revision (branch, tag, or commit hash).

    Returns:
        Full download URL for the file.

    Example:
        >>> hf_url_simple("bert-base-uncased", "config.json")
        "https://huggingface.co/bert-base-uncased/resolve/main/config.json"
    """
    encoded_path = quote(file_path, safe="/")
    return f"https://huggingface.co/{repo_id}/resolve/{revision}/{encoded_path}"


def filter_repo_objects(
    items: Iterable[T],
    *,
    allow_patterns: Optional[list[str] | str] = None,
    ignore_patterns: Optional[list[str] | str] = None,
    key: Optional[Callable[[T], str]] = None,
) -> Generator[T, None, None]:
    """Filter repository objects using Unix shell-style wildcards.

    This function filters items based on allow_patterns and ignore_patterns.
    If allow_patterns is provided, only matching items are kept.
    If ignore_patterns is provided, matching items are excluded.

    Args:
        items: Iterable of items to filter.
        allow_patterns: Pattern or list of patterns to include.
            If provided, only matching items are yielded.
        ignore_patterns: Pattern or list of patterns to exclude.
            Matching items are skipped.
        key: Function to extract the path from each item.
            Defaults to identity for strings/Paths, raises for other types.

    Yields:
        Items that pass the filter criteria.

    Example:
        >>> files = ["model.bin", "config.json", "README.md"]
        >>> list(filter_repo_objects(files, allow_patterns=["*.bin", "*.json"]))
        ['model.bin', 'config.json']
        >>> list(filter_repo_objects(files, ignore_patterns=["*.md"]))
        ['model.bin', 'config.json']
    """
    if isinstance(allow_patterns, str):
        allow_patterns = [allow_patterns]

    if isinstance(ignore_patterns, str):
        ignore_patterns = [ignore_patterns]

    if allow_patterns is not None:
        allow_patterns = [_add_wildcard_to_directories(p) for p in allow_patterns]
    if ignore_patterns is not None:
        ignore_patterns = [_add_wildcard_to_directories(p) for p in ignore_patterns]

    if key is None:

        def _identity(item: T) -> str:
            if isinstance(item, str):
                return item
            if isinstance(item, Path):
                return str(item)
            raise ValueError(
                f"Please provide `key` argument in `filter_repo_objects`: "
                f"`{item}` is not a string or Path."
            )

        key = _identity

    for item in items:
        path = key(item)

        # Skip if there's an allowlist and path doesn't match any
        if allow_patterns is not None and not any(
            fnmatch(path, r) for r in allow_patterns
        ):
            continue

        # Skip if there's a denylist and path matches any
        if ignore_patterns is not None and any(
            fnmatch(path, r) for r in ignore_patterns
        ):
            continue

        yield item


def _add_wildcard_to_directories(pattern: str) -> str:
    """Add wildcard to directory patterns.

    Args:
        pattern: The pattern to process.

    Returns:
        Pattern with wildcard added if it ends with /.
    """
    if pattern.endswith("/"):
        return pattern + "*"
    return pattern
