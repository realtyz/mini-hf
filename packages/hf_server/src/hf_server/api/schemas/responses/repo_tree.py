"""Response schemas for repo tree endpoints."""
from pydantic import BaseModel, Field


class RepoTreeLfsInfo(BaseModel):
    """LFS information for a file."""

    oid: str = Field(..., description="LFS blob SHA")
    size: int = Field(..., description="LFS file size in bytes")
    pointerSize: int = Field(..., description="Size of the LFS pointer file")


class RepoTreeItemResponse(BaseModel):
    """Response schema for a single tree item (file or folder)."""

    type: str = Field(..., description="Item type: 'file' or 'folder'")
    oid: str = Field(..., description="Blob ID for files, tree ID for folders")
    size: int = Field(..., description="File size in bytes (0 for folders)")
    path: str = Field(..., description="Path relative to repository root")
    lfs: RepoTreeLfsInfo | None = Field(None, description="LFS information if file is tracked by LFS")

    class Config:
        from_attributes = True
