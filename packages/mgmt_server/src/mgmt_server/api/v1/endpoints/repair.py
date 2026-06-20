"""Admin repair endpoints — manual status modification for profiles and snapshots."""

from fastapi import APIRouter

from mgmt_server.api.deps import AdminUserDep, RepairServiceDep
from mgmt_server.api.v1.schemas.repair import (
    RepairResponse,
    RepairResultData,
    SetProfileStatusRequest,
    SetSnapshotStatusRequest,
)

router = APIRouter()


@router.patch("/profile/{repo_id:path}/status", response_model=RepairResponse)
async def set_profile_status(
    repo_id: str,
    request: SetProfileStatusRequest,
    admin_user: AdminUserDep,
    repair_service: RepairServiceDep,
) -> RepairResponse:
    """Change a repository profile's status.

    Admin-only endpoint for fixing stuck or inconsistent profile states
    (e.g. profile stuck in UPDATING after worker crash).
    """
    result = await repair_service.set_profile_status(
        repo_id=repo_id,
        repo_type=request.repo_type,
        new_status=request.status,
    )
    return RepairResponse(
        data=RepairResultData(
            repo_id=result.repo_id,
            repo_type=result.repo_type,
            previous_status=result.previous_status,
            new_status=result.new_status,
        )
    )


@router.patch("/snapshot/{snapshot_id}/status", response_model=RepairResponse)
async def set_snapshot_status(
    snapshot_id: int,
    request: SetSnapshotStatusRequest,
    admin_user: AdminUserDep,
    repair_service: RepairServiceDep,
) -> RepairResponse:
    """Change a snapshot's status.

    Admin-only endpoint for fixing stuck or inconsistent snapshot states.
    When promoting to ACTIVE, any existing ACTIVE snapshot for the same
    revision is automatically archived.
    """
    result = await repair_service.set_snapshot_status(
        snapshot_id=snapshot_id,
        new_status=request.status,
    )
    return RepairResponse(
        data=RepairResultData(
            snapshot_id=result.snapshot_id,
            repo_id=result.repo_id,
            revision=result.revision,
            commit_hash=result.commit_hash,
            previous_status=result.previous_status,
            new_status=result.new_status,
            auto_archived_snapshot_id=result.auto_archived_snapshot_id,
        )
    )
