"""Internal API tree schemas."""
from pydantic import BaseModel, Field


class RepoTreeQueryRequest(BaseModel):
    """Request for querying repo tree."""

    path: str = Field("", description="Directory path to list (empty for root)")
    recursive: bool = Field(False, description="List recursively")
    revision: str | None = Field(None, description="Git revision (branch/tag/commit)")
    cursor: str | None = Field(None, description="Pagination cursor")
    limit: int = Field(100, ge=1, le=1000, description="Items per page")


class RepoTreeSyncRequest(BaseModel):
    """Request to sync repo tree from HuggingFace."""

    repo_id: str = Field(..., description="Repository ID")
    repo_type: str = Field("model", description="Repository type: model or dataset")
    revision: str | None = Field(None, description="Git revision")
    access_token: str | None = Field(None, description="Access token for private repos")


class RepoTreeItemInfo(BaseModel):
    """Tree item info for internal API."""

    id: int
    path: str
    type: str  # file or folder
    size: int | None
    oid: str | None

    class Config:
        from_attributes = True


class RepoTreeSyncResponse(BaseModel):
    """Response for tree sync operation."""

    snapshot_id: int
    repo_id: str
    commit_hash: str
    total_items: int
    files_count: int
    folders_count: int
