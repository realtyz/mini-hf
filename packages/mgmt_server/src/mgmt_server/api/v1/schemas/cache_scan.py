"""Cache scan response schemas."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from mgmt_server.api.v1.schemas.base import BaseResponse


class ScanCategory(str, Enum):
    cold = "cold"
    orphan = "orphan"
    untracked = "untracked"


class RepoScanItem(BaseModel):
    """A repository identified by cache scan."""

    repo_id: str
    repo_type: str
    category: ScanCategory
    pipeline_tag: str | None = None
    downloads: int
    last_downloaded_at: datetime | None = None
    first_cached_at: datetime | None = None
    cache_updated_at: datetime | None = None
    cached_commits: int
    cached_size: int = Field(0, description="Total cached file size in bytes")


class ScanResultData(BaseModel):
    """Scan result payload."""

    scanned_at: datetime
    threshold_days: int
    total_cold_repos: int
    total_orphan_repos: int = 0
    total_untracked_repos: int = 0
    total_wasted_bytes: int
    repos: list[RepoScanItem]


ScanResultResponse = BaseResponse[ScanResultData]
