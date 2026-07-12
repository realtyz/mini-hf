"""Preview task service for async repository preview operations."""

from __future__ import annotations

import secrets
from collections.abc import Awaitable, Callable
from typing import Any

from cache.keys import CacheKeys
from cache.services.cache import CacheService
from database.db_models import Source, User
from database.db_repositories import HfRepoSnapshotRepository, HfRepoTreeRepository
from loguru import logger
from services.config import ConfigService
from services.huggingface import HuggingfaceService
from services.huggingface.utils import filter_repo_objects
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
from mgmt_server.core.exceptions import (
    ConflictError,
    ResourceGoneError,
    ValidationError,
)
from mgmt_server.utils.token_utils import decode_access_token, encode_access_token
from mgmt_server.services.task_lifecycle_service import TaskLifecycleService
from mgmt_server.services.task_preview_executor import (
    PreviewResult,
    PreviewTaskConfig,
    _annotate_cached_status,
    _build_result_payloads,
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
            CacheKeys.preview_task.key(task_id),
            data,
            ttl=CacheKeys.preview_task.ttl,
        )

    async def _get_preview_state(self, task_id: str) -> dict[str, Any] | None:
        return await self._cache.get(CacheKeys.preview_task.key(task_id))

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
        user: User,
    ) -> tuple[AsyncPreviewTaskResponse, TaskPreviewService.BackgroundCallback | None]:
        """Validate and prepare an async preview task.

        Returns (response, background_callable). The caller is responsible
        for scheduling the background callable (e.g. via FastAPI BackgroundTasks).
        background_callable may be None if the result was served from local cache.
        """
        if source != Source.HUGGINGFACE.value:
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

        task_control = await self._config_service.get_task_control_config()
        if task_control.max_per_user > 0:
            active_count = await self._task_service.count_active_tasks_by_user(user.id)
            if active_count >= task_control.max_per_user:
                raise ConflictError(
                    f"You have reached the maximum number of active tasks "
                    f"({active_count}/{task_control.max_per_user}). "
                    "Please wait for existing tasks to complete before submitting a new one."
                )

        actual_endpoint = await self._get_hf_endpoint(hf_endpoint)

        operator = HuggingfaceService(token=access_token, endpoint=actual_endpoint)
        is_valid, error_message, _requires_token, upstream_sha = \
            await operator.validate_repo_access(
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
            )
        if not is_valid:
            raise ValidationError(error_message)

        # Try local snapshot fast path — match by commit_hash regardless of status
        if upstream_sha:
            snapshot_repo = HfRepoSnapshotRepository(self._session)
            local_snapshot = await snapshot_repo.get_snapshot_by_repo(
                repo_id=repo_id, repo_type=repo_type, revision=revision,
                commit_hash=upstream_sha,
            )

            if local_snapshot:
                tree_repo = HfRepoTreeRepository(self._session)
                tree_items = await tree_repo.get_file_tree(local_snapshot.commit_hash)

                # Guard: fall back to HF API if tree is empty
                if not tree_items:
                    logger.debug(
                        "[PreviewTask] Local snapshot {} has empty tree_items, "
                        "falling back to HF API",
                        local_snapshot.commit_hash,
                    )
                else:
                    # Build preview items from local DB
                    preview_items: list[dict[str, Any]] = []
                    required_file_paths: set[str] = set()

                    for item in tree_items:
                        entry = {
                            "path": item.path,
                            "size": item.size,
                            "type": item.type.value,
                            "required": item.type.value == "file",
                        }
                        preview_items.append(entry)
                        if item.type.value == "file":
                            required_file_paths.add(item.path)

                    # If not full_download, re-filter required
                    if not full_download:
                        file_items = [
                            item for item in tree_items
                            if item.type.value == "file"
                        ]
                        filtered = list(filter_repo_objects(
                            file_items,
                            allow_patterns=allow_patterns,
                            ignore_patterns=ignore_patterns,
                            key=lambda f: f.path,
                        ))
                        required_paths = {f.path for f in filtered}
                        for entry in preview_items:
                            if entry["type"] == "file":
                                entry["required"] = entry["path"] in required_paths
                    else:
                        required_paths = required_file_paths

                    # Annotate cache status
                    cached_paths = {
                        item.path for item in tree_items
                        if item.type.value == "file" and item.is_cached is True
                    }
                    _annotate_cached_status(preview_items, cached_paths)

                    # Compute stats
                    file_items_all = [
                        item for item in tree_items
                        if item.type.value == "file"
                    ]
                    total_storage = sum(item.size for item in file_items_all)
                    total_file_count = len(file_items_all)
                    required_storage = sum(
                        item.size for item in file_items_all
                        if item.path in required_paths
                    )
                    required_file_count = len(required_paths)

                    # Check all cached
                    all_required_cached = all(
                        item.is_cached is True for item in file_items_all
                        if item.path in required_paths
                    )

                    # Build result via shared helpers
                    cache_key = secrets.token_urlsafe(16)
                    encoded_token = encode_access_token(access_token)

                    result = PreviewResult(
                        source=source,
                        repo_id=repo_id,
                        repo_type=repo_type,
                        revision=revision,
                        commit_hash=upstream_sha,
                        hf_endpoint=hf_endpoint,
                        access_token=access_token,
                        preview_items=preview_items,
                        all_required_cached=all_required_cached,
                        cached_commit_hash=local_snapshot.commit_hash
                        if all_required_cached else None,
                        total_storage=total_storage,
                        total_file_count=total_file_count,
                        required_storage=required_storage,
                        required_file_count=required_file_count,
                    )

                    cache_data, task_result = _build_result_payloads(
                        result, cache_key, encoded_token
                    )

                    await self._cache.set(
                        CacheKeys.preview_result.key(cache_key), cache_data,
                        ttl=CacheKeys.preview_result.ttl,
                    )

                    task_id = secrets.token_urlsafe(16)

                    await self._save_preview_state(task_id, {
                        "status": "completed",
                        "repo_id": repo_id,
                        "repo_type": repo_type,
                        "revision": revision,
                        "progress_message": "Preview completed (from local snapshot)",
                        "progress_percent": 100.0,
                        "result": task_result,
                    })

                    logger.info(
                        "[PreviewTask {}] Completed from local snapshot (commit={}), "
                        "{} files, {} required",
                        task_id, upstream_sha[:12],
                        total_file_count, required_file_count,
                    )

                    return AsyncPreviewTaskResponse(
                        code=200,
                        message="Preview completed (from local snapshot)",
                        data=AsyncPreviewTaskData(
                            task_id=task_id,
                            status="completed",
                            message="Preview completed from local snapshot",
                        ),
                    ), None  # Fast path — no background task

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
                upstream_sha=upstream_sha,
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

    async def _validate_and_decode_preview_data(
        self,
        cache_key: str,
    ) -> CreateTaskFromPreviewRequest:
        """Validate cached preview data and return parsed request.

        Raises:
            ResourceGoneError: If preview data has expired or is invalid.
            ConflictError: If all required files are already cached.
        """
        logger.debug("Creating task from cache key: {}", cache_key)
        cache_data: dict[str, Any] | None = await self._cache.get(
            CacheKeys.preview_result.key(cache_key)
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
        return CreateTaskFromPreviewRequest(**cache_data)

    async def create_task_from_cache(
        self,
        cache_key: str,
        user: User,
        selected_files: list[str] | None = None,
    ) -> TaskDetailResponse:
        """Create a download task from cached preview data."""
        task_data = await self._validate_and_decode_preview_data(cache_key)

        task_control = await self._config_service.get_task_control_config()
        if task_control.max_per_user > 0:
            active_count = await self._task_service.count_active_tasks_by_user(user.id)
            if active_count >= task_control.max_per_user:
                raise ConflictError(
                    f"You have reached the maximum number of active tasks "
                    f"({active_count}/{task_control.max_per_user}). "
                    "Please wait for existing tasks to complete before submitting a new one."
                )

        if selected_files is not None:
            selected_set = set(selected_files)
            for item in task_data.items:
                item.required = item.path in selected_set
            task_data.required_file_count = sum(
                1 for item in task_data.items if item.required
            )
            task_data.required_storage = sum(
                item.size for item in task_data.items if item.required
            )

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
            repo_items=[
                item.model_dump()
                for item in task_data.items
                if item.type == "file" and item.required
            ],
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
