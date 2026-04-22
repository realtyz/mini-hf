"""Task management service for API routes."""

import base64
import secrets
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Any

from loguru import logger
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession

from cache import cache_service
from database import get_session
from database.db_models import Task, TaskStatus, User
from database.db_repositories.task import TaskRepository
from database.db_repositories.user import UserRepository
from mgmt_server.core.exceptions import (
    ConflictError,
    GoneError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)
from services import task_notification_service
from services.config import ConfigService
from services.huggingface import HuggingfaceService, RepoFile, RepoFolder
from services.task import TaskService
from mgmt_server.services.repo_service import RepoService
from mgmt_server.api.v1.schemas import (
    ActiveTaskListResponse,
    AsyncPreviewTaskData,
    AsyncPreviewTaskResponse,
    AsyncPreviewTaskStatusData,
    AsyncPreviewTaskStatusResponse,
    CreateTaskFromPreviewRequest,
    FileProgressItem,
    TaskCreatorUser,
    TaskDetailResponse,
    TaskListResponse,
    TaskPreviewData,
    TaskProgressData,
    TaskProgressResponse,
    TaskResponse,
)

_PREVIEW_TASK_PREFIX = "preview_task:"
_PREVIEW_TASK_TTL = 600  # 10 minutes

AsyncCallback = Callable[[], Awaitable[None]]


class TaskMgmtService:
    """Service for task management API operations.

    Coordinates preview tasks, task lifecycle, permissions, notifications,
    and response building so that route handlers remain thin.
    """

    def __init__(self, session: AsyncSession | None = None):
        """Initialize with optional injected session."""
        self._session = session
        self._task_service = TaskService(session)

    @asynccontextmanager
    async def _session_ctx(self):
        """Yield a session, closing it only if we created it."""
        if self._session is not None:
            yield self._session
        else:
            session = get_session()
            try:
                yield session
            finally:
                await session.close()

    # ------------------------------------------------------------------
    # Response builders
    # ------------------------------------------------------------------

    @staticmethod
    def build_task_response(
        task: Task,
        creator_user: TaskCreatorUser | None = None,
    ) -> TaskResponse:
        """Build TaskResponse from a Task model."""
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
            creator_user=creator_user,
            total_storage=task.total_storage,
            required_file_count=task.required_file_count,
            total_file_count=task.total_file_count,
            repo_items=[] if "repo_items" in sa_inspect(task).unloaded else (task.repo_items or []),
            commit_hash=task.commit_hash,
        )

    def build_task_detail_response(
        self,
        task: Task,
        creator_user: TaskCreatorUser | None = None,
    ) -> TaskDetailResponse:
        return TaskDetailResponse(
            data=self.build_task_response(task, creator_user=creator_user),
        )

    def build_task_list_response(
        self,
        tasks: list[Task],
        total: int,
    ) -> TaskListResponse:
        return TaskListResponse(
            data=[self.build_task_response(t) for t in tasks],
            total=total,
        )

    def build_active_task_list_response(
        self,
        tasks: list[Task],
    ) -> ActiveTaskListResponse:
        return ActiveTaskListResponse(
            data=[self.build_task_response(t) for t in tasks],
        )

    # ------------------------------------------------------------------
    # Permission helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _ensure_admin_or_creator(task: Task, user: User) -> None:
        if user.role != "admin" and task.creator_user_id != user.id:
            raise PermissionDeniedError(
                "Permission denied: only the task creator or an admin can perform this action"
            )

    # ------------------------------------------------------------------
    # Preview task state (Redis)
    # ------------------------------------------------------------------

    @staticmethod
    async def _save_preview_state(task_id: str, data: dict[str, Any]) -> None:
        await cache_service.set(
            f"{_PREVIEW_TASK_PREFIX}{task_id}",
            data,
            ttl=_PREVIEW_TASK_TTL,
        )

    @staticmethod
    async def _get_preview_state(task_id: str) -> dict[str, Any] | None:
        return await cache_service.get(f"{_PREVIEW_TASK_PREFIX}{task_id}")

    @staticmethod
    async def _update_preview_state(
        task_id: str,
        status: str,
        repo_id: str,
        repo_type: str,
        revision: str,
        progress_message: str,
        progress_percent: float,
        **kwargs: Any,
    ) -> None:
        state = {
            "status": status,
            "repo_id": repo_id,
            "repo_type": repo_type,
            "revision": revision,
            "progress_message": progress_message,
            "progress_percent": progress_percent,
        }
        state.update(kwargs)
        await TaskMgmtService._save_preview_state(task_id, state)

    # ------------------------------------------------------------------
    # Preview task helpers
    # ------------------------------------------------------------------

    async def _get_hf_endpoint(self, hf_endpoint: str | None) -> str:
        if hf_endpoint is not None:
            return hf_endpoint
        async with self._session_ctx() as session:
            config_service = ConfigService(session)
            return await config_service.get_hf_default_endpoint()

    @staticmethod
    def _calculate_required_files(
        files: list[RepoFile],
        full_download: bool,
        allow_patterns: list[str] | None,
        ignore_patterns: list[str] | None,
        hf_service: HuggingfaceService,
        task_logger: Any,
    ) -> set[str]:
        if full_download:
            required_paths = {f.path for f in files}
            task_logger.debug(
                "Full download mode: all {} files required", len(required_paths)
            )
            return required_paths

        task_logger.info(
            "Filtering files with allow_patterns={}, ignore_patterns={}",
            allow_patterns,
            ignore_patterns,
        )
        filtered_files = hf_service.filter_files(
            files,
            allow_patterns=allow_patterns,
            ignore_patterns=ignore_patterns,
        )
        required_paths = {f.path for f in filtered_files}
        task_logger.info(
            "Filtered: {} of {} files match patterns",
            len(required_paths),
            len(files),
        )
        return required_paths

    @staticmethod
    def _build_preview_items(
        files: list[RepoFile],
        directories: list[RepoFolder],
        required_file_paths: set[str],
    ) -> list[dict[str, Any]]:
        preview_items: list[dict[str, Any]] = []
        required_dirs: set[str] = set()
        for file_path in required_file_paths:
            parts = file_path.split("/")
            for i in range(1, len(parts)):
                required_dirs.add("/".join(parts[:i]))

        for directory in sorted(directories, key=lambda d: d.path):
            preview_items.append(
                {
                    "path": directory.path,
                    "size": 0,
                    "type": "directory",
                    "required": directory.path in required_dirs,
                }
            )

        for file in sorted(files, key=lambda f: f.path):
            preview_items.append(
                {
                    "path": file.path,
                    "size": file.size,
                    "type": "file",
                    "required": file.path in required_file_paths,
                }
            )

        return preview_items

    @staticmethod
    async def _check_cache_status(
        repo_id: str,
        repo_type: str,
        revision: str,
        required_file_paths: set[str],
        task_logger: Any,
    ) -> tuple[bool, str | None]:
        try:
            repo_service = RepoService()
            return await repo_service.check_cached_status(
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                required_file_paths=required_file_paths,
            )
        except Exception as e:
            task_logger.warning("Failed to check cache status: {}", e)
            return False, None

    # ------------------------------------------------------------------
    # Preview task execution (background)
    # ------------------------------------------------------------------

    async def execute_preview_task(
        self,
        task_id: str,
        source: str,
        repo_id: str,
        repo_type: str,
        revision: str,
        access_token: str | None,
        full_download: bool,
        allow_patterns: list[str] | None,
        ignore_patterns: list[str] | None,
        hf_endpoint: str | None = None,
    ) -> None:
        """Execute preview task in background."""
        task_logger = logger.bind(
            task_id=task_id,
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
        )
        task_logger.info("Starting preview execution")

        try:
            actual_endpoint = await self._get_hf_endpoint(hf_endpoint)

            await self._update_preview_state(
                task_id,
                status="fetching",
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                progress_message="Connecting to HuggingFace Hub...",
                progress_percent=5.0,
            )

            hf_service = HuggingfaceService(
                token=access_token, endpoint=actual_endpoint
            )

            await self._update_preview_state(
                task_id,
                status="fetching",
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                progress_message="Fetching repository file tree...",
                progress_percent=10.0,
            )

            repo_info = await hf_service.get_repo_info(
                repo_id=repo_id, repo_type=repo_type, revision=revision
            )
            items = await hf_service.get_tree(
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
            )
            task_logger.info("Fetched {} items from repository", len(items))

            files = [item for item in items if isinstance(item, RepoFile)]
            directories = [item for item in items if isinstance(item, RepoFolder)]

            total_storage = sum(f.size for f in files)
            total_file_count = len(files)

            await self._update_preview_state(
                task_id,
                status="processing",
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                progress_message=f"Processing {total_file_count} files...",
                progress_percent=50.0,
            )

            if full_download and (allow_patterns or ignore_patterns):
                raise ValidationError(
                    "Cannot specify allow_patterns or ignore_patterns when full_download is True. "
                    "Set full_download to False to use pattern filtering."
                )

            required_file_paths = self._calculate_required_files(
                files,
                full_download,
                allow_patterns,
                ignore_patterns,
                hf_service,
                task_logger,
            )

            required_storage = sum(
                f.size for f in files if f.path in required_file_paths
            )
            required_file_count = len(required_file_paths)

            await self._update_preview_state(
                task_id,
                status="processing",
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                progress_message="Building preview data...",
                progress_percent=80.0,
            )

            preview_items = self._build_preview_items(
                files, directories, required_file_paths
            )
            commit_hash = repo_info.sha

            all_required_cached, cached_commit_hash = await self._check_cache_status(
                repo_id, repo_type, revision, required_file_paths, task_logger
            )

            if all_required_cached:
                task_logger.info(
                    "All {} required files are already cached",
                    len(required_file_paths),
                )

            cache_key = secrets.token_urlsafe(16)
            encoded_token = None
            if access_token:
                encoded_token = base64.b64encode(access_token.encode()).decode()

            cache_data = {
                "source": source,
                "repo_id": repo_id,
                "repo_type": repo_type,
                "revision": revision,
                "commit_hash": commit_hash,
                "hf_endpoint": hf_endpoint,
                "access_token": encoded_token,
                "total_storage": total_storage,
                "total_file_count": total_file_count,
                "required_storage": required_storage,
                "required_file_count": required_file_count,
                "items": preview_items,
                "all_required_cached": all_required_cached,
                "cached_commit_hash": cached_commit_hash,
            }
            await cache_service.set(f"preview:{cache_key}", cache_data, ttl=300)

            result = {
                "repo_id": repo_id,
                "repo_type": repo_type,
                "revision": revision,
                "commit_hash": commit_hash,
                "hf_endpoint": hf_endpoint,
                "total_storage": total_storage,
                "total_file_count": total_file_count,
                "required_storage": required_storage,
                "required_file_count": required_file_count,
                "items": preview_items,
                "cache_key": cache_key,
                "all_required_cached": all_required_cached,
                "cached_commit_hash": cached_commit_hash,
            }

            await self._update_preview_state(
                task_id,
                status="completed",
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                progress_message="Preview completed successfully",
                progress_percent=100.0,
                result=result,
            )

            task_logger.info(
                "Preview completed successfully. Result: {}/{} files, {}/{} bytes, cache_key={}",
                required_file_count,
                total_file_count,
                required_storage,
                total_storage,
                cache_key,
            )

        except Exception as e:
            await self._update_preview_state(
                task_id,
                status="failed",
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                progress_message="Preview failed",
                progress_percent=0.0,
                error_message=str(e),
            )
            task_logger.opt(exception=True).error("Preview failed")

    # ------------------------------------------------------------------
    # Preview task orchestration (called by routes)
    # ------------------------------------------------------------------

    async def start_preview_task(
        self,
        source: str,
        repo_id: str,
        repo_type: str,
        revision: str,
        access_token: str | None,
        full_download: bool,
        allow_patterns: list[str] | None,
        ignore_patterns: list[str] | None,
        hf_endpoint: str | None,
    ) -> tuple[AsyncPreviewTaskResponse, AsyncCallback]:
        """Validate and prepare an async preview task.

        Returns (response, background_callable). The caller is responsible
        for scheduling the background callable (e.g. via FastAPI BackgroundTasks).
        """
        if source != "huggingface":
            raise ValidationError(
                f"Source '{source}' is not supported for preview. Only 'huggingface' is supported."
            )

        if "/" not in repo_id or repo_id.startswith("/") or repo_id.endswith("/") or repo_id.count("/") != 1:
            raise ValidationError(
                f"Invalid repo_id format: '{repo_id}'. Must be in 'namespace/repo_name' format."
            )

        if full_download and (allow_patterns or ignore_patterns):
            raise ValidationError(
                "Cannot specify allow_patterns or ignore_patterns when full_download is True. "
                "Set full_download to False to use pattern filtering."
            )

        async with self._session_ctx() as session:
            task_repo = TaskRepository(session)
            existing = await task_repo.get_active_download_task(
                repo_id=repo_id, source=source
            )
            if existing:
                raise ConflictError(
                    f"An active task for repository '{repo_id}' already exists. "
                    f"Task ID: {existing.id}, Status: {existing.status}. "
                    "Please wait for it to complete or cancel it before creating a new task."
                )

        actual_endpoint = await self._get_hf_endpoint(hf_endpoint)

        operator = HuggingfaceService(token=access_token, endpoint=actual_endpoint)
        is_valid, error_message, _requires_token = await operator.validate_repo_access(
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
        )
        if not is_valid:
            raise ValidationError(error_message)

        task_id = secrets.token_urlsafe(16)
        logger.info(
            "[PreviewTask {}] Created task for {} ({}) revision={}",
            task_id,
            repo_id,
            repo_type,
            revision,
        )

        await self._save_preview_state(
            task_id,
            {
                "status": "pending",
                "repo_id": repo_id,
                "repo_type": repo_type,
                "revision": revision,
                "progress_message": "Waiting to start...",
                "progress_percent": 0.0,
            },
        )

        async def _run_preview() -> None:
            await self.execute_preview_task(
                task_id=task_id,
                source=source,
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                access_token=access_token,
                full_download=full_download,
                allow_patterns=allow_patterns,
                ignore_patterns=ignore_patterns,
                hf_endpoint=hf_endpoint,
            )

        logger.debug("[PreviewTask {}] Background execution started", task_id)

        return AsyncPreviewTaskResponse(
            code=200,
            message="Preview task started. Use GET /task/preview/{task_id} to poll for results.",
            data=AsyncPreviewTaskData(
                task_id=task_id,
                status="pending",
                message="Task queued",
            ),
        ), _run_preview

    async def get_preview_task_status(
        self,
        task_id: str,
    ) -> AsyncPreviewTaskStatusResponse:
        """Get async preview task status and result."""
        task_data = await self._get_preview_state(task_id)
        if not task_data:
            raise GoneError(f"Preview task {task_id} not found or expired")

        result_data = None
        if task_data.get("status") == "completed" and task_data.get("result"):
            result = task_data["result"]
            result_data = TaskPreviewData(
                repo_id=result["repo_id"],
                repo_type=result["repo_type"],
                revision=result["revision"],
                commit_hash=result["commit_hash"],
                hf_endpoint=result.get("hf_endpoint"),
                total_storage=result["total_storage"],
                total_file_count=result["total_file_count"],
                required_storage=result["required_storage"],
                required_file_count=result["required_file_count"],
                items=result["items"],
                cache_key=result["cache_key"],
                all_required_cached=result.get("all_required_cached", False),
                cached_commit_hash=result.get("cached_commit_hash"),
            )

        return AsyncPreviewTaskStatusResponse(
            data=AsyncPreviewTaskStatusData(
                task_id=task_id,
                status=task_data.get("status", "unknown"),
                repo_id=task_data.get("repo_id", ""),
                repo_type=task_data.get("repo_type", ""),
                revision=task_data.get("revision", ""),
                progress_message=task_data.get("progress_message", ""),
                progress_percent=task_data.get("progress_percent", 0.0),
                error_message=task_data.get("error_message"),
                result=result_data,
            )
        )

    # ------------------------------------------------------------------
    # Task creation
    # ------------------------------------------------------------------

    async def create_task_from_cache(
        self,
        cache_key: str,
        user: User,
    ) -> TaskDetailResponse:
        """Create a download task from cached preview data."""
        cache_data = await cache_service.get(f"preview:{cache_key}")
        if not cache_data:
            raise GoneError(
                "Preview data expired or invalid, please preview again"
            )

        if cache_data.get("all_required_cached"):
            cached_commit = cache_data.get("cached_commit_hash", "")
            raise ConflictError(
                f"All required files are already cached (commit: {cached_commit[:12] if cached_commit else 'unknown'}). No need to create a new task."
            )

        if cache_data.get("access_token"):
            cache_data["access_token"] = base64.b64decode(
                cache_data["access_token"].encode()
            ).decode()

        task_data = CreateTaskFromPreviewRequest(**cache_data)

        task = await self._task_service.add_new_task(
            source=task_data.source,
            repo_id=task_data.repo_id,
            revision=task_data.revision,
            repo_type=task_data.repo_type,
            commit_hash=task_data.commit_hash,
            hf_endpoint=task_data.hf_endpoint,
            access_token=task_data.access_token,
            creator_user_id=user.id,
            total_file_count=task_data.total_file_count,
            required_file_count=task_data.required_file_count,
            total_storage=task_data.total_storage,
            required_storage=task_data.required_storage,
            repo_items=[item.model_dump() for item in task_data.items],
        )

        async with self._session_ctx() as session:
            config_service = ConfigService(session)
            notification_config = await config_service.get_notification_config()

        auto_approve_enabled = notification_config["auto_approve_enabled"]
        auto_approve_threshold_gb = notification_config["auto_approve_threshold_gb"]
        task_approval_push = notification_config["task_approval_push"]
        notification_email = notification_config["email"]

        required_storage_gb = task.required_storage / (1024**3)
        should_send_email = False

        if auto_approve_enabled:
            if required_storage_gb < auto_approve_threshold_gb:
                logger.info(
                    "Task {} auto-approved: required_storage={:.2f}GB < threshold={}GB",
                    task.id,
                    required_storage_gb,
                    auto_approve_threshold_gb,
                )
                try:
                    auto_approved_task = await self._task_service.review_task(
                        task_id=task.id,
                        approved=True,
                        reviewer_user_id=user.id,
                        review_notes=f"Auto-approved: required storage ({required_storage_gb:.2f} GB) is below threshold ({auto_approve_threshold_gb} GB)",
                    )
                    if auto_approved_task:
                        task = auto_approved_task
                except Exception as e:
                    logger.error("Failed to auto-approve task {}: {}", task.id, e)
            else:
                logger.info(
                    "Task {} requires manual approval: required_storage={:.2f}GB >= threshold={}GB",
                    task.id,
                    required_storage_gb,
                    auto_approve_threshold_gb,
                )
                if task_approval_push and notification_email:
                    should_send_email = True
        else:
            if task_approval_push and notification_email:
                should_send_email = True

        if should_send_email:
            logger.info("Sending approval notification email for task {}", task.id)
            await task_notification_service.send_task_approval_notification(
                task=task,
                notification_emails=notification_email,
            )

        return self.build_task_detail_response(task)

    # ------------------------------------------------------------------
    # Task lifecycle
    # ------------------------------------------------------------------

    async def review_task(
        self,
        task_id: int,
        approved: bool,
        reviewer_user_id: int,
        review_notes: str | None,
    ) -> TaskDetailResponse:
        task = await self._task_service.review_task(
            task_id=task_id,
            approved=approved,
            reviewer_user_id=reviewer_user_id,
            review_notes=review_notes,
        )
        if not task:
            raise NotFoundError(f"Task {task_id} not found")
        return self.build_task_detail_response(task)

    async def cancel_task(
        self,
        task_id: int,
        user: User,
    ) -> TaskDetailResponse:
        task = await self._task_service.get_task(task_id)
        if not task:
            raise NotFoundError(f"Task {task_id} not found")

        self._ensure_admin_or_creator(task, user)

        if task.status not in (
            TaskStatus.RUNNING,
            TaskStatus.PENDING,
            TaskStatus.PAUSING,
            TaskStatus.PAUSED,
        ):
            raise ValidationError(
                f"Task cannot be cancelled in status '{task.status.value}'"
            )

        success = await self._task_service.request_cancel(task_id)
        if not success:
            raise ValidationError("Failed to cancel task")

        await task_notification_service.send_task_notification(
            task=task,
            status="cancelled",
        )

        updated_task = await self._task_service.get_task(task_id)
        if not updated_task:
            raise NotFoundError(f"Task {task_id} not found")

        creator = await self._get_creator_user(updated_task.creator_user_id)
        return self.build_task_detail_response(updated_task, creator_user=creator)

    async def pause_task(
        self,
        task_id: int,
        user: User,
    ) -> TaskDetailResponse:
        task = await self._task_service.get_task(task_id)
        if not task:
            raise NotFoundError(f"Task {task_id} not found")

        self._ensure_admin_or_creator(task, user)

        if task.status not in (TaskStatus.RUNNING, TaskStatus.PENDING):
            raise ValidationError(
                f"Task cannot be paused in status '{task.status.value}'"
            )

        success = await self._task_service.request_pause(task_id)
        if not success:
            raise ValidationError("Failed to pause task")

        updated_task = await self._task_service.get_task(task_id)
        if not updated_task:
            raise NotFoundError(f"Task {task_id} not found")

        creator = await self._get_creator_user(updated_task.creator_user_id)
        return self.build_task_detail_response(updated_task, creator_user=creator)

    async def resume_task(
        self,
        task_id: int,
        user: User,
    ) -> TaskDetailResponse:
        task = await self._task_service.get_task(task_id)
        if not task:
            raise NotFoundError(f"Task {task_id} not found")

        self._ensure_admin_or_creator(task, user)

        if task.status != TaskStatus.PAUSED:
            raise ValidationError(
                f"Task cannot be resumed in status '{task.status.value}'"
            )

        success = await self._task_service.request_resume(task_id)
        if not success:
            raise ValidationError("Failed to resume task")

        updated_task = await self._task_service.get_task(task_id)
        if not updated_task:
            raise NotFoundError(f"Task {task_id} not found")

        creator = await self._get_creator_user(updated_task.creator_user_id)
        return self.build_task_detail_response(updated_task, creator_user=creator)

    async def pin_task(
        self,
        task_id: int,
        user: User,
    ) -> TaskDetailResponse:
        async with self._session_ctx() as session:
            task_repo = TaskRepository(session)
            task = await task_repo.get_by_id(task_id)
            if not task:
                raise NotFoundError(f"Task {task_id} not found")
            if task.creator_user_id != user.id and user.role != "admin":
                raise PermissionDeniedError("Only task creator or admin can pin this task")

            task = await self._task_service.pin_task(task_id)
            if not task:
                raise NotFoundError(f"Task {task_id} not found")

            creator = await self._get_creator_user(task.creator_user_id)
            return self.build_task_detail_response(task, creator_user=creator)

    async def unpin_task(
        self,
        task_id: int,
        user: User,
    ) -> TaskDetailResponse:
        async with self._session_ctx() as session:
            task_repo = TaskRepository(session)
            task = await task_repo.get_by_id(task_id)
            if not task:
                raise NotFoundError(f"Task {task_id} not found")
            if task.creator_user_id != user.id and user.role != "admin":
                raise PermissionDeniedError(
                    "Only task creator or admin can unpin this task"
                )

            task = await self._task_service.unpin_task(task_id)
            if not task:
                raise NotFoundError(f"Task {task_id} not found")

            creator = await self._get_creator_user(task.creator_user_id)
            return self.build_task_detail_response(task, creator_user=creator)

    async def retry_task(
        self,
        task_id: int,
        user: User,
    ) -> TaskDetailResponse:
        original_task = await self._task_service.get_task(task_id)
        if not original_task:
            raise NotFoundError(f"Task {task_id} not found")

        if original_task.status not in (TaskStatus.FAILED, TaskStatus.CANCELLED):
            raise ValidationError(
                f"Task cannot be retried: status is '{original_task.status.value}', must be 'failed' or 'cancelled'"
            )

        if original_task.completed_at is None:
            raise ValidationError(
                "Task cannot be retried: no completion time recorded"
            )

        seven_days_ago = datetime.now() - timedelta(days=7)
        if original_task.completed_at < seven_days_ago:
            raise ValidationError(
                f"Task cannot be retried: completed more than 7 days ago (completed at {original_task.completed_at.isoformat()})"
            )

        self._ensure_admin_or_creator(original_task, user)

        async with self._session_ctx() as session:
            task_repo = TaskRepository(session)
            existing = await task_repo.get_active_download_task(
                repo_id=original_task.repo_id,
                source=original_task.source,
            )
            if existing:
                raise ConflictError(
                    f"An active task for repository '{original_task.repo_id}' already exists. "
                    f"Task ID: {existing.id}, Status: {existing.status}. "
                    "Please wait for it to complete or cancel it before retrying."
                )

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
            required_file_count=original_task.required_file_count,
            total_storage=original_task.total_storage,
            required_storage=original_task.required_storage,
            repo_items=original_task.repo_items,
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

        creator = await self._get_creator_user(new_task.creator_user_id)
        return self.build_task_detail_response(new_task, creator_user=creator)

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    async def list_tasks(
        self,
        status_str: str | None,
        search: str | None,
        limit: int,
        skip: int,
        user: User,
    ) -> TaskListResponse:
        status_filter = None
        if status_str:
            try:
                status_filter = TaskStatus(status_str)
            except ValueError:
                raise ValidationError(f"Invalid status: {status_str}")

        creator_user_id = None if user.role == "admin" else user.id
        total, tasks = await self._task_service.list_tasks(
            status=status_filter,
            limit=limit,
            skip=skip,
            creator_user_id=creator_user_id,
            search=search,
            exclude_repo_items=True,
        )
        return self.build_task_list_response(tasks, total)

    async def list_public_tasks(
        self,
        status_str: str | None,
        search: str | None,
        limit: int,
        skip: int,
        hours: int,
    ) -> TaskListResponse:
        status_filter = None
        if status_str:
            try:
                status_filter = TaskStatus(status_str)
            except ValueError:
                raise ValidationError(f"Invalid status: {status_str}")

        since = datetime.now() - timedelta(hours=hours)
        total, tasks = await self._task_service.list_tasks(
            status=status_filter,
            limit=limit,
            skip=skip,
            since=since,
            search=search,
            exclude_repo_items=True,
        )
        return self.build_task_list_response(tasks, total)

    async def list_active_public_tasks(self) -> ActiveTaskListResponse:
        tasks = await self._task_service.list_active_tasks(exclude_repo_items=True)
        return self.build_active_task_list_response(tasks)

    async def get_task_detail(self, task_id: int) -> TaskDetailResponse:
        task = await self._task_service.get_task(task_id)
        if not task:
            raise NotFoundError(f"Task {task_id} not found")

        creator = await self._get_creator_user(task.creator_user_id)
        return self.build_task_detail_response(task, creator_user=creator)

    async def get_task_progress(self, task_id: int) -> TaskProgressResponse:
        task_key = f"task_progress:{task_id}"
        task_data = await cache_service.get(task_key)

        if not task_data:
            raise NotFoundError(
                f"Task progress not found for task {task_id}. "
                "The task may not have started or has already completed."
            )

        files_key_pattern = f"task_files:{task_id}:*"
        file_keys = await cache_service.scan_iter(files_key_pattern)

        files: list[FileProgressItem] = []
        if file_keys:
            file_data_list = await cache_service.mget(file_keys)
            for file_data in file_data_list:
                if file_data:
                    files.append(
                        FileProgressItem(
                            path=file_data.get("path", ""),
                            status=file_data.get("status", "pending"),
                            downloaded_bytes=file_data.get("downloaded_bytes", 0),
                            total_bytes=file_data.get("total_bytes", 0),
                            progress_percent=file_data.get("progress_percent", 0.0),
                            speed_bytes_per_sec=file_data.get("speed_bytes_per_sec"),
                            started_at=file_data.get("started_at"),
                            completed_at=file_data.get("completed_at"),
                            error_message=file_data.get("error_message"),
                        )
                    )

        files.sort(key=lambda x: x.path)

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

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_creator_user(self, creator_user_id: int) -> TaskCreatorUser | None:
        async with self._session_ctx() as session:
            creator = await UserRepository(session).get_by_id(creator_user_id)
            if creator:
                return TaskCreatorUser(
                    id=creator.id, name=creator.name, email=creator.email
                )
            return None
