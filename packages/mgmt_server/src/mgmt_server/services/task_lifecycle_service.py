"""Task lifecycle service for task state transitions and queries."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Any

from cache.services.cache import CacheService
from database.db_models import Task, TaskStatus, User
from loguru import logger
from services import TaskNotificationService
from services.config import ConfigService
from services.task import TaskService
from sqlalchemy.ext.asyncio import AsyncSession

from mgmt_server.api.v1.schemas import (
    ActiveTaskListResponse,
    TaskDetailResponse,
    TaskListResponse,
    TaskPreviewData,
    TaskPreviewResponse,
    TaskProgressResponse,
)
from mgmt_server.core.constants import BYTES_PER_GB, TASK_RETRY_WINDOW_DAYS, UserRole
from mgmt_server.core.exceptions import (
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)
from mgmt_server.services.repo_service import RepoService
from mgmt_server.services.task_response_builder import (
    build_active_task_list_response,
    build_file_progress_items,
    build_progress_response,
    build_task_detail_response,
    build_task_list_response,
)
from mgmt_server.services.user_service import UserService


class TaskLifecycleService:
    """Service for task lifecycle actions: cancel, pause, resume, pin, retry, etc."""

    AsyncCallback = Callable[[Task], Awaitable[Task | None]]

    def __init__(
        self,
        session: AsyncSession,
        task_service: TaskService,
        user_service: UserService,
        config_service: ConfigService,
        cache_service: CacheService,
        notification_service: TaskNotificationService,
    ) -> None:
        self._session = session
        self._task_service = task_service
        self._user_service = user_service
        self._config_service = config_service
        self._cache_service = cache_service
        self._notification = notification_service

    # ------------------------------------------------------------------
    # Permission helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _ensure_admin_or_creator(task: Task, user: User) -> None:
        if user.role != UserRole.ADMIN and task.creator_user_id != user.id:
            raise PermissionDeniedError(
                "Permission denied: only the task creator or an admin can perform this action"
            )

    # ------------------------------------------------------------------
    # Common lifecycle flow
    # ------------------------------------------------------------------

    async def _task_lifecycle_action(
        self,
        task_id: int,
        user: User,
        allowed_statuses: set[TaskStatus],
        action: TaskLifecycleService.AsyncCallback,
        action_name: str,
    ) -> TaskDetailResponse:
        """Common flow for lifecycle actions: fetch, authorize, validate status, act, respond.

        The action callback receives the current task and may optionally return
        a different Task (e.g. retry creates a new task). If it returns None,
        the original task is re-fetched from the database.
        """
        task = await self._task_service.get_task(task_id)
        if not task:
            raise NotFoundError(f"Task '{task_id}' not found")

        self._ensure_admin_or_creator(task, user)

        if task.status not in allowed_statuses:
            raise ValidationError(
                f"Task cannot be {action_name} in status '{task.status.value}'"
            )

        result_task = await action(task)
        if result_task is not None:
            updated_task = result_task
        else:
            updated_task = await self._task_service.get_task(task_id)
            if not updated_task:
                raise NotFoundError(f"Task '{task_id}' not found")

        creator = await self._user_service.get_by_id(updated_task.creator_user_id)
        return build_task_detail_response(updated_task, creator_user=creator)

    # ------------------------------------------------------------------
    # Auto-approve & notification
    # ------------------------------------------------------------------

    async def auto_approve_and_notify(self, task: Task, user: User) -> Task:
        """Apply auto-approval rules and send notification if needed.

        Returns the (possibly updated) task after auto-approval.
        """
        notification_config = await self._config_service.get_notification_config()

        auto_approve_enabled = notification_config.auto_approve_enabled
        auto_approve_threshold_gb = notification_config.auto_approve_threshold_gb
        task_approval_push = notification_config.task_approval_push
        notification_email = notification_config.email

        required_storage_gb = task.required_storage / BYTES_PER_GB

        task = await self._auto_approve(
            task,
            user,
            required_storage_gb,
            auto_approve_enabled,
            auto_approve_threshold_gb,
        )

        await self._notify_if_needed(
            task,
            required_storage_gb,
            auto_approve_enabled,
            auto_approve_threshold_gb,
            task_approval_push,
            notification_email,
        )

        return task

    async def _auto_approve(
        self,
        task: Task,
        user: User,
        required_storage_gb: float,
        auto_approve_enabled: bool,
        threshold_gb: float,
    ) -> Task:
        """Attempt to auto-approve a task if eligible.

        If auto-approval fails, the task remains in PENDING_APPROVAL so that
        the notification logic can still send an approval email.
        """
        if not auto_approve_enabled or required_storage_gb >= threshold_gb:
            return task

        logger.info(
            "Task {} auto-approved: required_storage={:.2f}GB < threshold={}GB",
            task.id,
            required_storage_gb,
            threshold_gb,
        )
        try:
            auto_approved_task = await self._task_service.review_task(
                task_id=task.id,
                approved=True,
                reviewer_user_id=user.id,
                review_notes=f"Auto-approved: required storage ({required_storage_gb:.2f} GB) is below threshold ({threshold_gb} GB)",
            )
            if auto_approved_task:
                return auto_approved_task
        except Exception as e:
            logger.error("Failed to auto-approve task {}: {}", task.id, e)
        return task

    async def _notify_if_needed(
        self,
        task: Task,
        required_storage_gb: float,
        auto_approve_enabled: bool,
        threshold_gb: float,
        task_approval_push: bool,
        notification_email: str | None,
    ) -> None:
        """Send approval notification email if needed."""
        if task.status != TaskStatus.PENDING_APPROVAL:
            return

        if not task_approval_push or not notification_email:
            return

        if not auto_approve_enabled and required_storage_gb >= threshold_gb:
            logger.info(
                "Task {} requires manual approval: required_storage={:.2f}GB >= threshold={}GB",
                task.id,
                required_storage_gb,
                threshold_gb,
            )

        logger.info("Sending approval notification email for task {}", task.id)
        await self._notification.send_task_approval_notification(
            task=task,
            notification_emails=notification_email,
        )

    # ------------------------------------------------------------------
    # Lifecycle actions
    # ------------------------------------------------------------------

    async def review_task(
        self,
        task_id: int,
        approved: bool,
        reviewer_user_id: int,
        review_notes: str | None,
        user: User,
    ) -> TaskDetailResponse:
        async def _do_review(_task: Task) -> Task | None:
            return await self._task_service.review_task(
                task_id=task_id,
                approved=approved,
                reviewer_user_id=reviewer_user_id,
                review_notes=review_notes,
            )

        return await self._task_lifecycle_action(
            task_id=task_id,
            user=user,
            allowed_statuses={TaskStatus.PENDING_APPROVAL},
            action=_do_review,
            action_name="reviewed",
        )

    async def cancel_task(self, task_id: int, user: User) -> TaskDetailResponse:
        async def _do_cancel(task: Task) -> None:
            success = await self._task_service.request_cancel(task_id)
            if not success:
                raise ValidationError("Failed to cancel task")
            await self._notification.send_task_notification(
                task=task, status="cancelled"
            )

        return await self._task_lifecycle_action(
            task_id=task_id,
            user=user,
            allowed_statuses={
                TaskStatus.RUNNING,
                TaskStatus.PENDING,
                TaskStatus.PAUSING,
                TaskStatus.PAUSED,
            },
            action=_do_cancel,
            action_name="cancelled",
        )

    async def pause_task(self, task_id: int, user: User) -> TaskDetailResponse:
        async def _do_pause(_task: Task) -> None:
            success = await self._task_service.request_pause(task_id)
            if not success:
                raise ValidationError("Failed to pause task")

        return await self._task_lifecycle_action(
            task_id=task_id,
            user=user,
            allowed_statuses={TaskStatus.RUNNING, TaskStatus.PENDING},
            action=_do_pause,
            action_name="paused",
        )

    async def resume_task(self, task_id: int, user: User) -> TaskDetailResponse:
        async def _do_resume(_task: Task) -> None:
            success = await self._task_service.request_resume(task_id)
            if not success:
                raise ValidationError("Failed to resume task")

        return await self._task_lifecycle_action(
            task_id=task_id,
            user=user,
            allowed_statuses={TaskStatus.PAUSED},
            action=_do_resume,
            action_name="resumed",
        )

    async def pin_task(self, task_id: int, user: User) -> TaskDetailResponse:
        async def _do_pin(_task: Task) -> None:
            pinned = await self._task_service.pin_task(task_id)
            if not pinned:
                raise ValidationError("Failed to pin task")

        return await self._task_lifecycle_action(
            task_id=task_id,
            user=user,
            allowed_statuses={TaskStatus.PENDING},
            action=_do_pin,
            action_name="pinned",
        )

    async def unpin_task(self, task_id: int, user: User) -> TaskDetailResponse:
        async def _do_unpin(_task: Task) -> None:
            unpinned = await self._task_service.unpin_task(task_id)
            if not unpinned:
                raise ValidationError("Failed to unpin task")

        return await self._task_lifecycle_action(
            task_id=task_id,
            user=user,
            allowed_statuses={TaskStatus.PENDING},
            action=_do_unpin,
            action_name="unpinned",
        )

    async def retry_task(self, task_id: int, user: User, selected_files: list[str] | None = None) -> TaskDetailResponse:
        async def _do_retry(original_task: Task) -> Task:
            if original_task.completed_at is None:
                raise ValidationError(
                    "Task cannot be retried: no completion time recorded"
                )

            seven_days_ago = datetime.now() - timedelta(days=TASK_RETRY_WINDOW_DAYS)
            if original_task.completed_at < seven_days_ago:
                raise ValidationError(
                    f"Task cannot be retried: completed more than {TASK_RETRY_WINDOW_DAYS} days ago (completed at {original_task.completed_at.isoformat()})"
                )

            existing = await self._task_service.get_active_download_task(
                repo_id=original_task.repo_id,
                source=original_task.source,
            )
            if existing:
                raise ConflictError(
                    f"An active task for repository '{original_task.repo_id}' already exists. "
                    f"Task ID: {existing.id}, Status: {existing.status}. "
                    "Please wait for it to complete or cancel it before retrying."
                )

            # Filter repo_items based on selected_files (if provided)
            repo_items = [
                item
                for item in (original_task.repo_items or [])
                if item.get("type") == "file" and item.get("required", True)
            ]

            if selected_files is not None and len(selected_files) > 0:
                selected_set = set(selected_files)
                repo_items = [item for item in repo_items if item.get("path") in selected_set]
                required_file_count = len(repo_items)
                required_storage = sum(item.get("size", 0) for item in repo_items)
            else:
                required_file_count = original_task.required_file_count
                required_storage = original_task.required_storage

            new_task = await self._task_service.add_new_task(
                source=original_task.source,
                repo_id=original_task.repo_id,
                repo_type=original_task.repo_type,
                revision=original_task.revision,
                commit_hash=original_task.commit_hash,
                hf_endpoint=original_task.hf_endpoint,
                access_token=original_task.access_token,
                creator_user_id=original_task.creator_user_id,
                total_file_count=original_task.total_file_count,
                required_file_count=required_file_count,
                total_storage=original_task.total_storage,
                required_storage=required_storage,
                repo_items=repo_items,
            )

            approved_task = await self._task_service.review_task(
                task_id=new_task.id,
                approved=True,
                reviewer_user_id=user.id,
                review_notes=f"Auto-approved retry of failed task {task_id}",
            )
            if approved_task:
                new_task = approved_task

            logger.info(
                "User {} retried failed task {} as new task {}",
                user.id,
                task_id,
                new_task.id,
            )

            return new_task

        return await self._task_lifecycle_action(
            task_id=task_id,
            user=user,
            allowed_statuses={TaskStatus.FAILED, TaskStatus.CANCELLED},
            action=_do_retry,
            action_name="retried",
        )

    # ------------------------------------------------------------------
    # Retry Preview
    # ------------------------------------------------------------------

    async def retry_preview_task(
        self, task_id: int, user: User
    ) -> TaskPreviewResponse:
        """Preview files for retry with cache status annotation.

        Performs the same pre-checks as retry_task and returns a file list
        annotated with is_cached for each item.
        """
        task = await self._task_service.get_task(task_id)
        if not task:
            raise NotFoundError(f"Task '{task_id}' not found")

        self._ensure_admin_or_creator(task, user)

        if task.status not in {TaskStatus.FAILED, TaskStatus.CANCELLED}:
            raise ValidationError(
                f"Task cannot be retried in status '{task.status.value}'"
            )

        if task.completed_at is None:
            raise ValidationError(
                "Task cannot be retried: no completion time recorded"
            )

        seven_days_ago = datetime.now() - timedelta(days=TASK_RETRY_WINDOW_DAYS)
        if task.completed_at < seven_days_ago:
            raise ValidationError(
                f"Task cannot be retried: completed more than {TASK_RETRY_WINDOW_DAYS} days ago "
                f"(completed at {task.completed_at.isoformat()})"
            )

        existing = await self._task_service.get_active_download_task(
            repo_id=task.repo_id,
            source=task.source,
        )
        if existing:
            raise ConflictError(
                f"An active task for repository '{task.repo_id}' already exists. "
                f"Task ID: {existing.id}, Status: {existing.status}. "
                "Please wait for it to complete or cancel it before retrying."
            )

        # Build preview items from the task's repo_items
        repo_items = task.repo_items or []
        file_items = [
            item for item in repo_items
            if item.get("type") == "file" and item.get("required", True)
        ]

        # Check cache status via local snapshot
        cached_paths: set[str] = set()
        if task.commit_hash:
            repo_service = RepoService(self._session, task_service=self._task_service)
            _, _, cached_paths = await repo_service.check_cached_status(
                repo_id=task.repo_id,
                repo_type=task.repo_type,
                revision=task.revision,
                commit_hash=task.commit_hash,
                required_file_paths={item["path"] for item in file_items},
            )

        # Build preview items with cache annotation
        preview_items: list[dict[str, Any]] = []
        for item in file_items:
            entry = dict(item)
            entry["is_cached"] = item["path"] in cached_paths
            preview_items.append(entry)

        all_required_cached = (
            len(file_items) > 0
            and all(item["path"] in cached_paths for item in file_items)
        )

        required_file_count = len(file_items)
        required_storage = sum(item.get("size", 0) for item in file_items)

        data = TaskPreviewData(
            repo_id=task.repo_id,
            repo_type=task.repo_type,
            revision=task.revision,
            commit_hash=task.commit_hash,
            hf_endpoint=task.hf_endpoint,
            total_storage=task.total_storage,
            total_file_count=task.total_file_count,
            required_storage=required_storage,
            required_file_count=required_file_count,
            items=[
                {
                    "path": item["path"],
                    "size": item.get("size", 0),
                    "type": item.get("type", "file"),
                    "required": item.get("required", True),
                    "is_cached": item["is_cached"],
                }
                for item in preview_items
            ],
            cache_key="",  # No Redis cache needed for retry preview
            cached_commit_hash=task.commit_hash if cached_paths else None,
            all_required_cached=all_required_cached,
        )

        return TaskPreviewResponse(code=200, message="ok", data=data)

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    async def list_tasks(
        self,
        status: TaskStatus | None,
        search: str | None,
        limit: int,
        skip: int,
        user: User,
    ) -> TaskListResponse:
        creator_user_id = None if user.role == UserRole.ADMIN else user.id
        total, tasks = await self._task_service.list_tasks(
            status=status,
            limit=limit,
            skip=skip,
            creator_user_id=creator_user_id,
            search=search,
            exclude_repo_items=True,
        )
        return build_task_list_response(tasks, total)

    async def list_public_tasks(
        self,
        status: TaskStatus | None,
        search: str | None,
        limit: int,
        skip: int,
        hours: int,
    ) -> TaskListResponse:
        since = datetime.now() - timedelta(hours=hours)
        total, tasks = await self._task_service.list_tasks(
            status=status,
            limit=limit,
            skip=skip,
            since=since,
            search=search,
            exclude_repo_items=True,
        )
        return build_task_list_response(tasks, total)

    async def list_active_public_tasks(self) -> ActiveTaskListResponse:
        tasks = await self._task_service.list_active_tasks(exclude_repo_items=True)
        return build_active_task_list_response(tasks)

    async def get_task_detail(self, task_id: int) -> TaskDetailResponse:
        task = await self._task_service.get_task(task_id)
        if not task:
            raise NotFoundError(f"Task '{task_id}' not found")

        creator = await self._user_service.get_by_id(task.creator_user_id)
        return build_task_detail_response(task, creator_user=creator)

    async def get_task_progress(self, task_id: int) -> TaskProgressResponse:
        logger.debug("Fetching progress for task {}", task_id)
        task_key = f"task_progress:{task_id}"
        task_data: dict[str, Any] | None = await self._cache_service.get(task_key)

        if not task_data:
            raise NotFoundError(
                f"Task progress not found for task '{task_id}'. "
                "The task may not have started or has already completed."
            )

        files_list_key = f"task_files_list:{task_id}"
        file_paths = await self._cache_service.get(files_list_key) or []

        files = []
        if file_paths:
            file_keys = [
                f"task_files:{task_id}:{p.replace(':', '_').replace(' ', '_')}"
                for p in file_paths
            ]
            file_data_list = await self._cache_service.mget(file_keys)
            files = build_file_progress_items(file_data_list)

        return build_progress_response(task_data, files, task_id)
