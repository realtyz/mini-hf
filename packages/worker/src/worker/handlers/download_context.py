"""Download context shared across download phases and error recovery."""

from dataclasses import dataclass, field
from datetime import datetime

from worker.handlers.diff_calculator import FileDiff
from worker.handlers.types import SourceFile


@dataclass
class DownloadContext:
    """Download workflow shared state, passed between phases and error handlers."""

    repo_id: str
    repo_type: str
    revision: str
    access_token: str | None
    required_file_paths: set[str]

    # Populated during execution
    endpoint: str = ""
    new_commit_hash: str = ""
    old_commit_hash: str | None = None
    committed_at: datetime | None = None
    pipeline_tag: str | None = None
    diff: FileDiff | None = None
    files_to_download: list[SourceFile] = field(default_factory=list)
