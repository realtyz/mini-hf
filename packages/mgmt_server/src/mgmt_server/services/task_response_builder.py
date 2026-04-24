"""Task response building utilities."""

from __future__ import annotations

from typing import Any

from database.db_models import Task, User

from mgmt_server.api.v1.schemas import (
    ActiveTaskListResponse,
    CachedFileProgressData,
    FileProgressItem,
    TaskCreatorUser,
    TaskDetailResponse,
    TaskListResponse,
    TaskProgressData,
    TaskProgressResponse,
    TaskResponse,
)


def _to_creator_user(user: User | None) -> TaskCreatorUser | None:
    if user is None:
        return None
    return TaskCreatorUser(id=user.id, name=user.name, email=user.email)


def build_task_response(
    task: Task,
    creator_user: User | None = None,
    repo_items_override: list[dict] | None = None,
) -> TaskResponse:
    """Build TaskResponse from a Task model."""
    repo_items = (
        repo_items_override
        if repo_items_override is not None
        else (task.repo_items or [])
    )
    return TaskResponse(
        id=task.id,
        source=task.source,
        repo_id=task.repo_id,
        repo_type=task.repo_type,
        revision=task.revision,
        hf_endpoint=task.hf_endpoint,
        status=task.status.value,
        error_message=task.error_message,
        created_at=task.created_at,
        reviewed_at=task.reviewed_at,
        updated_at=task.updated_at,
        started_at=task.started_at,
        completed_at=task.completed_at,
        pinned_at=task.pinned_at,
        required_storage=task.required_storage,
        creator_user_id=task.creator_user_id,
        creator_user=_to_creator_user(creator_user),
        total_storage=task.total_storage,
        required_file_count=task.required_file_count,
        total_file_count=task.total_file_count,
        repo_items=repo_items,
        commit_hash=task.commit_hash,
    )


def build_task_detail_response(
    task: Task,
    creator_user: User | None = None,
) -> TaskDetailResponse:
    return TaskDetailResponse(
        data=build_task_response(task, creator_user=creator_user),
    )


def build_task_list_response(
    tasks: list[Task],
    total: int,
) -> TaskListResponse:
    return TaskListResponse(
        data=[build_task_response(t, repo_items_override=[]) for t in tasks],
        total=total,
    )


def build_active_task_list_response(
    tasks: list[Task],
) -> ActiveTaskListResponse:
    return ActiveTaskListResponse(
        data=[build_task_response(t, repo_items_override=[]) for t in tasks],
    )


# ------------------------------------------------------------------
# Task progress response building
# ------------------------------------------------------------------


def build_file_progress_items(
    file_data_list: list[dict[str, Any] | None],
) -> list[FileProgressItem]:
    """Parse file progress items from cached file data."""
    items: list[FileProgressItem] = []
    for file_data in file_data_list:
        if file_data:
            cached = CachedFileProgressData.model_validate(file_data)
            items.append(
                FileProgressItem(
                    path=cached.path,
                    status=cached.status,
                    downloaded_bytes=cached.downloaded_bytes,
                    total_bytes=cached.total_bytes,
                    progress_percent=cached.progress_percent,
                    speed_bytes_per_sec=cached.speed_bytes_per_sec,
                    started_at=cached.started_at,
                    completed_at=cached.completed_at,
                    error_message=cached.error_message,
                )
            )
    return items


def build_progress_response(
    task_data: dict[str, Any],
    files: list[FileProgressItem],
    task_id: int,
) -> TaskProgressResponse:
    """Build TaskProgressResponse from cached task and file data."""
    files = sorted(files, key=lambda x: x.path)

    total_bytes = sum(f.total_bytes for f in files)
    downloaded_bytes = sum(f.downloaded_bytes for f in files)
    completed_files = sum(1 for f in files if f.status == "completed")

    progress_percent = (
        (downloaded_bytes / total_bytes * 100) if total_bytes > 0 else 0.0
    )

    progress_data = TaskProgressData(
        task_id=task_data.get("task_id", task_id),
        status=task_data.get("status", "unknown"),
        progress_percent=round(progress_percent, 2),
        downloaded_files=completed_files,
        total_files=len(files) or task_data.get("total_files", 0),
        downloaded_bytes=downloaded_bytes,
        total_bytes=total_bytes or task_data.get("total_bytes", 0),
        current_file=task_data.get("current_file"),
        speed_bytes_per_sec=task_data.get("speed_bytes_per_sec"),
        eta_seconds=task_data.get("eta_seconds"),
        updated_at=task_data.get("updated_at", ""),
        files=files,
    )

    return TaskProgressResponse(data=progress_data)
