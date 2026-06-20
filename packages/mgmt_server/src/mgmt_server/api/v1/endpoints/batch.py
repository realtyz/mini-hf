"""Batch operation endpoints.

Batch operations are long-running actions on collections. They live in their own
namespace (/batch) to avoid path collisions with greedy :path route parameters
used for HF repo IDs (e.g. namespace/repo-name) in /hf_repo routes.
"""

from fastapi import APIRouter, BackgroundTasks

from mgmt_server.api.deps import AdminUserDep, BatchDeleteServiceDep
from mgmt_server.api.v1.schemas.repos import (
    BatchDeleteOperationState,
    BatchDeleteRepoRequest,
    BatchDeleteRepoResponse,
    BatchDeleteStatusResponse,
)
from mgmt_server.core.exceptions import NotFoundError

router = APIRouter()


@router.post(
    "/repo-delete",
    response_model=BatchDeleteRepoResponse,
    status_code=202,
)
async def batch_delete_repositories(
    request: BatchDeleteRepoRequest,
    background_tasks: BackgroundTasks,
    admin_user: AdminUserDep,
    batch_delete_service: BatchDeleteServiceDep,
) -> BatchDeleteRepoResponse:
    """Start a batch repository deletion in the background.

    Returns immediately with operation_id. Poll GET /batch/repo-delete/{operation_id}/status
    to track progress.
    """
    operation_id, unique_ids = await batch_delete_service.start_operation(
        request.repo_ids
    )
    bg_task = batch_delete_service.create_background_task(
        operation_id, unique_ids, repo_types=request.repo_types
    )
    background_tasks.add_task(bg_task)
    return BatchDeleteRepoResponse(
        data=[],
        operation_id=operation_id,
        total_requested=len(unique_ids),
        total_deleted=0,
        total_failed=0,
    )


@router.get(
    "/repo-delete/{operation_id}/status",
    response_model=BatchDeleteStatusResponse,
)
async def get_batch_delete_status(
    operation_id: str,
    admin_user: AdminUserDep,
    batch_delete_service: BatchDeleteServiceDep,
) -> BatchDeleteStatusResponse:
    """Query the progress of a batch delete operation."""
    data = await batch_delete_service.get_status(operation_id)
    if data is None:
        raise NotFoundError(
            f"Batch delete operation '{operation_id}' not found"
        )
    return BatchDeleteStatusResponse(
        data=BatchDeleteOperationState(**data),
    )
