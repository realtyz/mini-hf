"""HuggingFace download handler.

.. deprecated::
    This module is deprecated. Use `worker.handlers.hf` instead.

    Old: from worker.handlers.hf_handler import handle_download_huggingface
    New: from worker.handlers.hf import handle_download_huggingface
"""

# Re-export from new location for backward compatibility
from worker.handlers.hf import (
    handle_download_huggingface,
    FileDiff,
    calculate_file_diff,
    cleanup_deleted_files,
    save_repo_tree,
    download_and_upload_files,
)

__all__ = [
    "handle_download_huggingface",
    "FileDiff",
    "calculate_file_diff",
    "cleanup_deleted_files",
    "save_repo_tree",
    "download_and_upload_files",
]
