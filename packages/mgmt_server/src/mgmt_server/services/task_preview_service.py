"""Preview task service for async repository preview operations."""

from __future__ import annotations

import secrets
from collections.abc import Awaitable, Callable
from typing import Any

from cache.services.cache import CacheService
from database.db_models import User
from loguru import logger
from services.config import ConfigService
from services.huggingface import HuggingfaceService
from services.task import TaskService
from sqlalchemy.ext.asyncio import AsyncSession

from mgmt_server.api.v1.schemas import (
    AsyncPreviewTaskData,
    AsyncPreviewTaskResponse,
    AsyncPreviewTaskStatusData,
    AsyncPreviewTaskStatusResponse,
    CreateTaskFromPreviewRequest,
    TaskDetailResponse,
    TaskPreviewData,
)
from mgmt_server.core.constants import PREVIEW_TASK_TTL
from mgmt_server.core.exceptions import (
    ConflictError,
    ResourceGoneError,
    ValidationError,
)
from mgmt_server.core.token_utils import decode_access_token
from mgmt_server.services.task_lifecycle_service import TaskLifecycleService
from mgmt_server.services.task_preview_executor import (
    PREVIEW_TASK_PREFIX,
    PreviewTaskConfig,
    execute_preview_task,
)
from mgmt_server.services.task_response_builder import build_task_detail_response
from mgmt_server.services.user_service import UserService


class TaskPreviewService:
    """Service for preview task state management, validation, and execution."""

    BackgroundCallback = Callable[[], Awaitable[None]]

    def __init__(
        self,
        session: AsyncSession,
        task_service: TaskService,
        cache: CacheService,
        config_service: ConfigService,
        user_service: UserService,
        lifecycle_service: TaskLifecycleService,
    ) -> None:
        self._session = session
        self._task_service = task_service
        self._cache = cache
        self._config_service = config_service
        self._user_service = user_service
        self._lifecycle_service = lifecycle_service

    # ------------------------------------------------------------------
    # Preview task state (Redis)
    # ------------------------------------------------------------------

    async def _save_preview_state(self, task_id: str, data: dict[str, Any]) -> None:
        await self._cache.set(
            f"{PREVIEW_TASK_PREFIX}{task_id}",
            data,
            ttl=PREVIEW_TASK_TTL,
        )

    async def _get_preview_state(self, task_id: str) -> dict[str, Any] | None:
        return await self._cache.get(f"{PREVIEW_TASK_PREFIX}{task_id}")

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
    ) -> tuple[AsyncPreviewTaskResponse, TaskPreviewService.BackgroundCallback]:
        """Validate and prepare an async preview task.

        Returns (response, background_callable). The caller is responsible
        for scheduling the background callable (e.g. via FastAPI BackgroundTasks).
        """
        if source != "huggingface":
            raise ValidationError(
                f"Source '{source}' is not supported for preview. Only 'huggingface' is supported."
            )

        if (
            "/" not in repo_id
            or repo_id.startswith("/")
            or repo_id.endswith("/")
            or repo_id.count("/") != 1
        ):
            raise ValidationError(
                f"Invalid repo_id format: '{repo_id}'. Must be in 'namespace/repo_name' format."
            )

        if full_download and (allow_patterns or ignore_patterns):
            raise ValidationError(
                "Cannot specify allow_patterns or ignore_patterns when full_download is True. "
                "Set full_download to False to use pattern filtering."
            )

        existing = await self._task_service.get_active_download_task(
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

        # Capture only the cache reference (module-level singleton), not self.
        cache = self._cache

        async def _run_preview() -> None:
            config = PreviewTaskConfig(
                task_id=task_id,
                source=source,
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                access_token=access_token,
                full_download=full_download,
                allow_patterns=allow_patterns,
                ignore_patterns=ignore_patterns,
                actual_endpoint=actual_endpoint,
                hf_endpoint=hf_endpoint,
            )
            await execute_preview_task(config, cache=cache)

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
            raise ResourceGoneError(f"Preview task '{task_id}' not found or expired")

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
    # Task creation from preview
    # ------------------------------------------------------------------

    async def create_task_from_cache(
        self,
        cache_key: str,
        user: User,
    ) -> TaskDetailResponse:
        """Create a download task from cached preview data."""
        logger.debug("Creating task from cache key: {}", cache_key)
        cache_data: dict[str, Any] | None = await self._cache.get(
            f"preview:{cache_key}"
        )
        if not cache_data:
            raise ResourceGoneError(
                "Preview data expired or invalid, please preview again"
            )

        if cache_data.get("all_required_cached"):
            cached_commit = cache_data.get("cached_commit_hash", "")
            raise ConflictError(
                f"All required files are already cached (commit: {cached_commit[:12] if cached_commit else 'unknown'}). No need to create a new task."
            )

        cache_data["access_token"] = decode_access_token(cache_data.get("access_token"))

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

        task = await self._lifecycle_service.auto_approve_and_notify(task, user)

        logger.info("Created task {} from preview cache for user {}", task.id, user.id)

        creator = await self._user_service.get_by_id(task.creator_user_id)
        return build_task_detail_response(task, creator_user=creator)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_hf_endpoint(self, hf_endpoint: str | None) -> str:
        if hf_endpoint is not None:
            return hf_endpoint
        return await self._config_service.get_hf_default_endpoint()
