"""Task queue endpoints."""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends

from mgmt_server.api.deps import (
    AdminUserDep,
    CurrentUserDep,
    TaskPreviewServiceDep,
    TaskLifecycleServiceDep,
)
from mgmt_server.api.v1.schemas import (
    ActiveTaskListResponse,
    AsyncPreviewTaskResponse,
    AsyncPreviewTaskStatusResponse,
    CreateTaskFromCacheRequest,
    PublicTaskListQueryParams,
    TaskDetailResponse,
    TaskListQueryParams,
    TaskListResponse,
    TaskPreviewRequest,
    TaskPreviewResponse,
    TaskProgressResponse,
    TaskRetryRequest,
    TaskReviewRequest,
)

router = APIRouter()

TaskListParamsDep = Annotated[TaskListQueryParams, Depends()]
PublicTaskListParamsDep = Annotated[PublicTaskListQueryParams, Depends()]


@router.get("/list", response_model=TaskListResponse)
async def list_tasks(
    current_user: CurrentUserDep,
    service: TaskLifecycleServiceDep,
    params: TaskListParamsDep,
) -> TaskListResponse:
    """List tasks - requires JWT authentication."""
    return await service.list_tasks(
        status=params.status,
        search=params.search,
        limit=params.limit,
        skip=params.skip,
        user=current_user,
    )


@router.get("/active-public", response_model=ActiveTaskListResponse)
async def list_active_public_tasks(
    service: TaskLifecycleServiceDep,
) -> ActiveTaskListResponse:
    """List active tasks (running/pending/pending_approval/canceling) - public, no auth required."""
    return await service.list_active_public_tasks()


@router.get("/list-public", response_model=TaskListResponse)
async def list_public_tasks(
    service: TaskLifecycleServiceDep,
    params: PublicTaskListParamsDep,
) -> TaskListResponse:
    """List tasks from the last N hours - public access, no authentication required."""
    return await service.list_public_tasks(
        status=params.status,
        search=params.search,
        limit=params.limit,
        skip=params.skip,
        hours=params.hours,
    )


@router.get("/{task_id}", response_model=TaskDetailResponse)
async def get_task(
    task_id: int,
    current_user: CurrentUserDep,
    service: TaskLifecycleServiceDep,
) -> TaskDetailResponse:
    """Get task details - requires JWT authentication."""
    return await service.get_task_detail(task_id)


@router.post("/preview", response_model=AsyncPreviewTaskResponse)
async def preview_task(
    request: TaskPreviewRequest,
    current_user: CurrentUserDep,
    background_tasks: BackgroundTasks,
    service: TaskPreviewServiceDep,
) -> AsyncPreviewTaskResponse:
    """Start an async preview task for repository download."""
    response, bg_callable = await service.start_preview_task(
        source=request.source,
        repo_id=request.repo_id,
        repo_type=request.repo_type,
        revision=request.revision,
        access_token=request.access_token,
        full_download=request.full_download,
        allow_patterns=request.allow_patterns,
        ignore_patterns=request.ignore_patterns,
        hf_endpoint=request.hf_endpoint,
        user=current_user,
    )
    if bg_callable is not None:
        background_tasks.add_task(bg_callable)
    return response


@router.get("/preview/{task_id}", response_model=AsyncPreviewTaskStatusResponse)
async def get_preview_task_status(
    task_id: str,
    current_user: CurrentUserDep,
    service: TaskPreviewServiceDep,
) -> AsyncPreviewTaskStatusResponse:
    """Get async preview task status and result."""
    return await service.get_preview_task_status(task_id)


@router.post("", response_model=TaskDetailResponse)
async def create_repo_download_task(
    request: CreateTaskFromCacheRequest,
    current_user: CurrentUserDep,
    service: TaskPreviewServiceDep,
) -> TaskDetailResponse:
    """Create a download task from cached preview data."""
    return await service.create_task_from_cache(
        cache_key=request.cache_key,
        user=current_user,
        selected_files=request.selected_files,
    )


@router.post("/{task_id}/review", response_model=TaskDetailResponse)
async def review_task(
    task_id: int,
    request: TaskReviewRequest,
    admin_user: AdminUserDep,
    service: TaskLifecycleServiceDep,
) -> TaskDetailResponse:
    """Review (approve or reject) a pending approval task."""
    return await service.review_task(
        task_id=task_id,
        approved=request.approved,
        reviewer_user_id=admin_user.id,
        review_notes=request.notes,
        user=admin_user,
    )


@router.post("/{task_id}/cancel", response_model=TaskDetailResponse)
async def cancel_task(
    task_id: int,
    current_user: CurrentUserDep,
    service: TaskLifecycleServiceDep,
) -> TaskDetailResponse:
    """Cancel a running or pending task."""
    return await service.cancel_task(task_id, current_user)


@router.post("/{task_id}/pause", response_model=TaskDetailResponse)
async def pause_task(
    task_id: int,
    current_user: CurrentUserDep,
    service: TaskLifecycleServiceDep,
) -> TaskDetailResponse:
    """Pause a running or pending task."""
    return await service.pause_task(task_id, current_user)


@router.post("/{task_id}/resume", response_model=TaskDetailResponse)
async def resume_task(
    task_id: int,
    current_user: CurrentUserDep,
    service: TaskLifecycleServiceDep,
) -> TaskDetailResponse:
    """Resume a paused task."""
    return await service.resume_task(task_id, current_user)


@router.post("/{task_id}/pin", response_model=TaskDetailResponse)
async def pin_task(
    task_id: int,
    current_user: CurrentUserDep,
    service: TaskLifecycleServiceDep,
) -> TaskDetailResponse:
    """Pin a pending task to give it higher priority."""
    return await service.pin_task(task_id, current_user)


@router.post("/{task_id}/unpin", response_model=TaskDetailResponse)
async def unpin_task(
    task_id: int,
    current_user: CurrentUserDep,
    service: TaskLifecycleServiceDep,
) -> TaskDetailResponse:
    """Unpin a pinned task to remove its higher priority."""
    return await service.unpin_task(task_id, current_user)


@router.post("/{task_id}/retry", response_model=TaskDetailResponse)
async def retry_task(
    task_id: int,
    current_user: CurrentUserDep,
    service: TaskLifecycleServiceDep,
    request: TaskRetryRequest | None = None,
) -> TaskDetailResponse:
    """Retry a failed or cancelled task by creating a new task with the same configuration.

    Optionally accepts selected_files to retry only specific files.
    When omitted, all previously required files are retried (backward-compatible).
    """
    return await service.retry_task(
        task_id,
        current_user,
        selected_files=request.selected_files if request else None,
    )


@router.get("/{task_id}/retry-preview", response_model=TaskPreviewResponse)
async def retry_preview_task(
    task_id: int,
    current_user: CurrentUserDep,
    service: TaskLifecycleServiceDep,
) -> TaskPreviewResponse:
    """Preview files for retry with cache status annotation.

    Returns the same pre-checks as retry and a file list annotated with
    is_cached for each item, so the frontend can show which files are
    already cached and let the user choose which ones to retry.
    """
    return await service.retry_preview_task(task_id, current_user)


@router.get("/{task_id}/progress", response_model=TaskProgressResponse)
async def get_task_progress(
    task_id: int,
    service: TaskLifecycleServiceDep,
) -> TaskProgressResponse:
    """Get task file-level progress.

    Public endpoint (no auth required): allows unauthenticated progress
    polling for the frontend dashboard.
    """
    return await service.get_task_progress(task_id)
