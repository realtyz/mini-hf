"""Admin repair schemas — manual status modification for profiles and snapshots."""

from typing import Literal

from pydantic import BaseModel

from database.db_models.enums import RepoStatus, SnapshotStatus
from mgmt_server.api.v1.schemas.base import BaseResponse


class SetProfileStatusRequest(BaseModel):
    """Request body for changing a profile's RepoStatus."""

    repo_type: Literal["model", "dataset"]
    status: RepoStatus


class SetSnapshotStatusRequest(BaseModel):
    """Request body for changing a snapshot's SnapshotStatus."""

    status: SnapshotStatus


class RepairResultData(BaseModel):
    """Result of a repair operation.

    Fields are populated based on whether a profile or snapshot was modified.
    """

    # Profile fields
    repo_id: str | None = None
    repo_type: str | None = None

    # Snapshot fields
    snapshot_id: int | None = None
    revision: str | None = None
    commit_hash: str | None = None

    # Common
    previous_status: str
    new_status: str
    auto_archived_snapshot_id: int | None = None


class RepairResponse(BaseResponse[RepairResultData]):
    """Response for repair operations."""
