"""HuggingFace Hub operations service.

This module provides a unified interface for interacting with HuggingFace Hub,
including repository operations, file filtering, and URL generation.
"""

# Re-export types from huggingface_hub
from huggingface_hub import (
    RepoFile,
    RepoFolder,
    ModelInfo,
    DatasetInfo,
    SpaceInfo,
)
from huggingface_hub.errors import (
    RepositoryNotFoundError,
    GatedRepoError,
)

# Export service class
from .service import HuggingfaceService

# Export utility functions
from .utils import (
    is_commit_hash,
    REGEX_COMMIT_HASH,
    hf_url,
    hf_url_simple,
    filter_repo_objects,
)

# Backwards compatibility: RepoOperator is now HuggingfaceService
RepoOperator = HuggingfaceService

__all__ = [
    # Service class
    "HuggingfaceService",
    # Backwards compatibility
    "RepoOperator",
    # Utility functions
    "hf_url",
    "hf_url_simple",
    "filter_repo_objects",
    "is_commit_hash",
    "REGEX_COMMIT_HASH",
    # Types (re-exported from huggingface_hub)
    "RepoFile",
    "RepoFolder",
    "ModelInfo",
    "DatasetInfo",
    "SpaceInfo",
    # Exceptions (re-exported from huggingface_hub)
    "RepositoryNotFoundError",
    "GatedRepoError",
]
