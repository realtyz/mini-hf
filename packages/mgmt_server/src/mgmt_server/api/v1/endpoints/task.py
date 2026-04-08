"""Task queue endpoints."""

import base64
import secrets
from datetime import datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from loguru import logger

from cache import cache_service
from database import get_session
from database.db_models import User
from services.config import ConfigService
from services.huggingface import RepoFile, RepoFolder, HuggingfaceService
from mgmt_server.services.repo_service import RepoService

from database.db_repositories.user import UserRepository
from database.db_repositories.task import TaskRepository
from mgmt_server.api.deps import CurrentUserToken, DbDep, UserServiceDep
from mgmt_server.api.v1.endpoints.user import AdminUserDep, CurrentUserDep, get_current_user
from mgmt_server.api.v1.schemas import (
    AsyncPreviewTaskData,
    AsyncPreviewTaskResponse,
    AsyncPreviewTaskStatusData,
    AsyncPreviewTaskStatusResponse,
    CreateTaskFromCacheRequest,
    CreateTaskFromPreviewRequest,
    FileProgressItem,
    TaskListResponse,
    TaskCreatorUser,
    TaskDetailResponse,
    TaskPreviewData,
    TaskPreviewRequest,
    TaskProgressData,
    TaskProgressResponse,
    TaskResponse,
    TaskReviewRequest,
)
from services.task import TaskService, TaskStatus

router = APIRouter(prefix="/task", tags=["Task Management"])

# Preview task constants
_PREVIEW_TASK_PREFIX = "preview_task:"
_PREVIEW_TASK_TTL = 600  # 10 minutes


async def _save_preview_task_state(task_id: str, data: dict[str, Any]) -> None:
    """Save preview task state to Redis."""
    await cache_service.set(
        f"{_PREVIEW_TASK_PREFIX}{task_id}",
        data,
        ttl=_PREVIEW_TASK_TTL,
    )


async def _get_preview_task_state(task_id: str) -> dict[str, Any] | None:
    """Get preview task state from Redis."""
    return await cache_service.get(f"{_PREVIEW_TASK_PREFIX}{task_id}")


async def _get_hf_endpoint(hf_endpoint: str | None) -> str:
    """Get HF endpoint, falling back to config if not provided."""
    if hf_endpoint is not None:
        return hf_endpoint
    session = get_session()
    try:
        config_service = ConfigService(session)
        return await config_service.get_hf_default_endpoint()
    finally:
        await session.close()


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
    """Update preview task state in Redis."""
    state = {
        "status": status,
        "repo_id": repo_id,
        "repo_type": repo_type,
        "revision": revision,
        "progress_message": progress_message,
        "progress_percent": progress_percent,
    }
    state.update(kwargs)
    await _save_preview_task_state(task_id, state)


def _calculate_required_files(
    files: list[RepoFile],
    full_download: bool,
    allow_patterns: list[str] | None,
    ignore_patterns: list[str] | None,
    hf_service: HuggingfaceService,
    task_logger: Any,
) -> set[str]:
    """Calculate which files are required based on download mode and patterns."""
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
        "Filtered: {} of {} files match patterns", len(required_paths), len(files)
    )
    return required_paths


def _build_preview_items(
    files: list[RepoFile],
    directories: list[RepoFolder],
    required_file_paths: set[str],
) -> list[dict[str, Any]]:
    """Build preview items list from files and directories."""
    preview_items: list[dict[str, Any]] = []

    # Build a set of directory paths that contain required files
    required_dirs = set()
    for file_path in required_file_paths:
        parts = file_path.split("/")
        for i in range(1, len(parts)):
            required_dirs.add("/".join(parts[:i]))

    # Add directories
    for directory in sorted(directories, key=lambda d: d.path):
        preview_items.append(
            {
                "path": directory.path,
                "size": 0,
                "type": "directory",
                "required": directory.path in required_dirs,
            }
        )

    # Add files
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


async def _check_cache_status(
    repo_id: str,
    repo_type: str,
    revision: str,
    required_file_paths: set[str],
    task_logger: Any,
) -> tuple[bool, str | None]:
    """Check if all required files are already cached."""
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


async def _execute_hf_task_preview(
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
    """Execute preview task in background.

    This function runs the actual preview logic asynchronously,
    updating task status and progress in Redis as it proceeds.
    """
    task_logger = logger.bind(
        task_id=task_id, repo_id=repo_id, repo_type=repo_type, revision=revision
    )
    task_logger.info("Starting preview execution")

    try:
        # Determine endpoint
        actual_endpoint = await _get_hf_endpoint(hf_endpoint)

        # Initialize operator
        await _update_preview_state(
            task_id,
            status="fetching",
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
            progress_message="Connecting to HuggingFace Hub...",
            progress_percent=5.0,
        )
        task_logger.debug("Connecting to HuggingFace Hub...")

        hf_service = HuggingfaceService(token=access_token, endpoint=actual_endpoint)

        # Fetch repository tree
        await _update_preview_state(
            task_id,
            status="fetching",
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
            progress_message="Fetching repository file tree...",
            progress_percent=10.0,
        )
        task_logger.info("Fetching repository tree from HuggingFace Hub...")

        repo_info = await hf_service.get_repo_info(
            repo_id=repo_id, repo_type=repo_type, revision=revision
        )
        items = await hf_service.get_tree(
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
        )
        task_logger.info("Fetched {} items from repository", len(items))

        # Separate files and directories
        files = [item for item in items if isinstance(item, RepoFile)]
        directories = [item for item in items if isinstance(item, RepoFolder)]

        # Calculate total statistics
        total_storage = sum(f.size for f in files)
        total_file_count = len(files)

        task_logger.info(
            "Repository stats: {} files, {} bytes total",
            total_file_count,
            total_storage,
        )

        # Update progress
        await _update_preview_state(
            task_id,
            status="processing",
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
            progress_message=f"Processing {total_file_count} files...",
            progress_percent=50.0,
        )
        task_logger.debug("Processing files with full_download={}", full_download)

        # Validate conflicting parameters
        has_filter_patterns = allow_patterns or ignore_patterns
        if full_download and has_filter_patterns:
            task_logger.warning(
                "Conflicting parameters: full_download=True with filter patterns"
            )
            raise ValueError(
                "Cannot specify allow_patterns or ignore_patterns when full_download is True. "
                "Set full_download to False to use pattern filtering."
            )

        # Determine required files
        required_file_paths = _calculate_required_files(
            files,
            full_download,
            allow_patterns,
            ignore_patterns,
            hf_service,
            task_logger,
        )

        # Calculate required statistics
        required_storage = sum(f.size for f in files if f.path in required_file_paths)
        required_file_count = len(required_file_paths)

        # Build preview items
        await _update_preview_state(
            task_id,
            status="processing",
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
            progress_message="Building preview data...",
            progress_percent=80.0,
        )

        preview_items = _build_preview_items(files, directories, required_file_paths)

        # Get commit hash
        commit_hash = repo_info.sha

        # Check if all required files are already cached
        all_required_cached, cached_commit_hash = await _check_cache_status(
            repo_id, repo_type, revision, required_file_paths, task_logger
        )

        if all_required_cached:
            task_logger.info(
                "All {} required files are already cached", len(required_file_paths)
            )

        # Generate cache key for task creation
        cache_key = secrets.token_urlsafe(16)

        # Encode access token
        encoded_token = None
        if access_token:
            encoded_token = base64.b64encode(access_token.encode()).decode()

        # Build cache data for task creation
        cache_data = {
            "source": source,
            "repo_id": repo_id,
            "repo_type": repo_type,
            "revision": revision,
            "commit_hash": commit_hash,
            "hf_endpoint": actual_endpoint,
            "access_token": encoded_token,
            "total_storage": total_storage,
            "total_file_count": total_file_count,
            "required_storage": required_storage,
            "required_file_count": required_file_count,
            "items": preview_items,
            "all_required_cached": all_required_cached,
            "cached_commit_hash": cached_commit_hash,
        }

        # Cache preview data
        await cache_service.set(f"preview:{cache_key}", cache_data, ttl=300)

        # Build result
        result = {
            "repo_id": repo_id,
            "repo_type": repo_type,
            "revision": revision,
            "commit_hash": commit_hash,
            "hf_endpoint": actual_endpoint,
            "total_storage": total_storage,
            "total_file_count": total_file_count,
            "required_storage": required_storage,
            "required_file_count": required_file_count,
            "items": preview_items,
            "cache_key": cache_key,
            "all_required_cached": all_required_cached,
            "cached_commit_hash": cached_commit_hash,
        }

        # Mark as completed
        await _update_preview_state(
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
        await _update_preview_state(
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


@router.get("/list", response_model=TaskListResponse)
async def list_tasks(
    current_user: CurrentUserToken,
    db: DbDep,
    user_service: UserServiceDep,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> TaskListResponse:
    """List tasks - requires JWT authentication.

    Admin users can see all tasks.
    Regular users can only see tasks they created.

    Args:
        current_user: Current authenticated user token payload
        db: Database session
        user_service: User service dependency
        status: Filter by task status
        limit: Maximum number of tasks to return
        offset: Offset for pagination
    """
    # Resolve the current user entity
    user = await user_service.get_by_email(current_user.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    task_service = TaskService()

    # Parse status filter
    status_filter = None
    if status:
        try:
            status_filter = TaskStatus(status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    # Non-admin users can only see their own tasks
    creator_user_id = None if user.role == "admin" else user.id

    tasks = await task_service.list_tasks(
        status=status_filter,
        limit=limit,
        offset=offset,
        creator_user_id=creator_user_id,
    )

    task_responses = [
        TaskResponse(
            id=t.id,
            source=t.source,
            repo_id=t.repo_id,
            repo_type=t.repo_type,
            revision=t.revision,
            hf_endpoint=t.hf_endpoint,
            status=t.status.value,
            error_message=t.error_message,
            created_at=t.created_at,
            reviewed_at=t.reviewed_at,
            updated_at=t.updated_at,
            started_at=t.started_at,
            completed_at=t.completed_at,
            pinned_at=t.pinned_at,
            required_storage=t.required_storage,
            creator_user_id=t.creator_user_id,
            total_storage=t.total_storage,
            required_file_count=t.required_file_count,
            total_file_count=t.total_file_count,
            repo_items=t.repo_items or [],
            commit_hash=t.commit_hash,
        )
        for t in tasks
    ]

    return TaskListResponse(data=task_responses, total=len(tasks))


@router.get("/list_public", response_model=TaskListResponse)
async def list_public_tasks(
    status: str | None = None,
    limit: int = 100,
    hours: int = 24,
) -> TaskListResponse:
    """List tasks from the last N hours - public access, no authentication required.

    Args:
        status: Filter by task status
        limit: Maximum number of tasks to return
        hours: Time window in hours (default: 24)
    """
    task_service = TaskService()

    # Parse status filter
    status_filter = None
    if status:
        try:
            status_filter = TaskStatus(status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    # Calculate time range (default: last 24 hours)
    since = datetime.now() - timedelta(hours=hours)

    tasks = await task_service.list_tasks(
        status=status_filter, limit=limit, since=since
    )

    task_responses = [
        TaskResponse(
            id=t.id,
            source=t.source,
            repo_id=t.repo_id,
            repo_type=t.repo_type,
            revision=t.revision,
            hf_endpoint=t.hf_endpoint,
            status=t.status.value,
            error_message=t.error_message,
            created_at=t.created_at,
            reviewed_at=t.reviewed_at,
            updated_at=t.updated_at,
            started_at=t.started_at,
            completed_at=t.completed_at,
            pinned_at=t.pinned_at,
            required_storage=t.required_storage,
            creator_user_id=t.creator_user_id,
            total_storage=t.total_storage,
            required_file_count=t.required_file_count,
            total_file_count=t.total_file_count,
            repo_items=t.repo_items or [],
            commit_hash=t.commit_hash,
        )
        for t in tasks
    ]

    return TaskListResponse(data=task_responses, total=len(tasks))


@router.get("/{task_id}", response_model=TaskDetailResponse)
async def get_task(
    task_id: int,
    current_user: CurrentUserToken,
    db: DbDep,
) -> TaskDetailResponse:
    """Get task details - requires JWT authentication."""
    task_service = TaskService()
    task = await task_service.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")

    creator = await UserRepository(db).get_by_id(task.creator_user_id)
    if creator:
        creator_user = TaskCreatorUser(
            id=creator.id, name=creator.name, email=creator.email
        )
    else:
        creator_user = None

    return TaskDetailResponse(
        data=TaskResponse(
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
            repo_items=task.repo_items or [],
            commit_hash=task.commit_hash,
        )
    )


@router.post("/preview", response_model=AsyncPreviewTaskResponse)
async def preview_task(
    request: TaskPreviewRequest,
    current_user: CurrentUserToken,
    background_tasks: BackgroundTasks,
    db: DbDep,
) -> AsyncPreviewTaskResponse:
    """Start an async preview task for repository download.

    This endpoint immediately returns a task_id. The actual repository tree
    fetching happens in the background. Use GET /task/preview/{task_id} to
    poll for completion and retrieve results.

    Args:
        request: Preview request with repository details and filter patterns
        current_user: Current authenticated user
        background_tasks: FastAPI background tasks for async execution

    Returns:
        AsyncPreviewTaskResponse with task_id for polling

    Raises:
        HTTPException: If source is not supported or repository access is denied
    """
    # Currently only support HuggingFace
    if request.source != "huggingface":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Source '{request.source}' is not supported for preview. Only 'huggingface' is supported.",
        )

    # Validate conflicting parameters
    has_filter_patterns = request.allow_patterns or request.ignore_patterns
    if request.full_download and has_filter_patterns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot specify allow_patterns or ignore_patterns when full_download is True. "
            "Set full_download to False to use pattern filtering.",
        )

    # Check for existing active tasks with same repo_id and source
    task_repo = TaskRepository(db)
    existing_task = await task_repo.get_active_download_task(
        repo_id=request.repo_id,
        source=request.source,
    )
    if existing_task:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An active task for repository '{request.repo_id}' already exists. "
            f"Task ID: {existing_task.id}, Status: {existing_task.status}. "
            f"Please wait for it to complete or cancel it before creating a new task.",
        )

    # Determine endpoint: prefer explicit hf_endpoint parameter, then config
    actual_endpoint = request.hf_endpoint
    if actual_endpoint is None:
        config_service = ConfigService(db)
        actual_endpoint = await config_service.get_hf_default_endpoint()

    operator = HuggingfaceService(token=request.access_token, endpoint=actual_endpoint)
    is_valid, error_message, requires_token = await operator.validate_repo_access(
        repo_id=request.repo_id,
        repo_type=request.repo_type,
        revision=request.revision,
    )

    if not is_valid:
        # Return 401 for token-related issues, 404 for not found
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_message,
        )

    # Generate task ID
    task_id = secrets.token_urlsafe(16)
    logger.info(
        "[PreviewTask {}] Created task for {} ({}) revision={}",
        task_id,
        request.repo_id,
        request.repo_type,
        request.revision,
    )

    # Save initial state to Redis
    await _save_preview_task_state(
        task_id,
        {
            "status": "pending",
            "repo_id": request.repo_id,
            "repo_type": request.repo_type,
            "revision": request.revision,
            "progress_message": "Waiting to start...",
            "progress_percent": 0.0,
        },
    )

    # Add to background tasks for async execution
    background_tasks.add_task(
        _execute_hf_task_preview,
        task_id=task_id,
        source=request.source,
        repo_id=request.repo_id,
        repo_type=request.repo_type,
        revision=request.revision,
        access_token=request.access_token,
        full_download=request.full_download,
        allow_patterns=request.allow_patterns,
        ignore_patterns=request.ignore_patterns,
        hf_endpoint=actual_endpoint,
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
    )


@router.get("/preview/{task_id}", response_model=AsyncPreviewTaskStatusResponse)
async def get_preview_task_status(
    task_id: str,
    current_user: CurrentUserToken,
) -> AsyncPreviewTaskStatusResponse:
    """Get async preview task status and result.

    Poll this endpoint after starting a preview task with POST /task/preview.
    Returns current progress and final result when completed.

    Args:
        task_id: Preview task ID returned from POST /task/preview
        current_user: Current authenticated user

    Returns:
        Task status, progress, and result (if completed)

    Raises:
        HTTPException: 404 if task not found or expired
    """
    task_data = await _get_preview_task_state(task_id)

    if not task_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preview task {task_id} not found or expired",
        )

    # Build result data if completed
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


@router.post("", response_model=TaskDetailResponse)
async def create_repo_download_task(
    request: CreateTaskFromCacheRequest,
    user_service: UserServiceDep,
    current_user: CurrentUserToken,
    db: DbDep,
) -> TaskDetailResponse:
    """Create a download task from cached preview data.

    This endpoint requires a cache_key from the /task/preview endpoint.
    All task data is retrieved from the cache.

    Auto-approval and notification logic:
    - If auto-approval is enabled and required_storage < threshold: auto-approve task
    - If auto-approval is enabled but required_storage >= threshold and notification is enabled: send email
    - If auto-approval is disabled and notification is enabled: send email

    Args:
        request: Cache key from /task/preview endpoint
        user_service: User service dependency
        current_user: Current authenticated user token payload
        db: Database session

    Returns:
        Created task information

    Raises:
        HTTPException: If cache expired or invalid (410)
    """
    # Get real user ID from JWT token
    user = await user_service.get_by_email(current_user.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get preview data from cache
    cache_data = await cache_service.get(f"preview:{request.cache_key}")
    if not cache_data:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Preview data expired or invalid, please preview again",
        )

    # Check if all required files are already cached
    if cache_data.get("all_required_cached"):
        cached_commit = cache_data.get("cached_commit_hash", "")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"All required files are already cached (commit: {cached_commit[:12] if cached_commit else 'unknown'}). No need to create a new task.",
        )

    # Decode access_token if present
    if cache_data.get("access_token"):
        cache_data["access_token"] = base64.b64decode(
            cache_data["access_token"].encode()
        ).decode()

    # Convert cached dict to request object
    task_data = CreateTaskFromPreviewRequest(**cache_data)

    task_service = TaskService()

    task = await task_service.add_new_task(
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

    # Handle auto-approval and notification
    from services.config import ConfigService
    from services import task_notification_service

    config_service = ConfigService(db)
    notification_config = await config_service.get_notification_config()

    auto_approve_enabled = notification_config["auto_approve_enabled"]
    auto_approve_threshold_gb = notification_config["auto_approve_threshold_gb"]
    task_approval_push = notification_config["task_approval_push"]
    notification_email = notification_config["email"]

    # Convert required_storage from bytes to GB for comparison (1 GB = 1024^3 bytes)
    required_storage_gb = task.required_storage / (1024**3)

    should_send_email = False

    if auto_approve_enabled:
        # Auto-approval is enabled
        if required_storage_gb < auto_approve_threshold_gb:
            # Below threshold: auto-approve the task
            logger.info(
                "Task {} auto-approved: required_storage={:.2f}GB < threshold={}GB",
                task.id,
                required_storage_gb,
                auto_approve_threshold_gb,
            )
            try:
                # Use task creator as reviewer for auto-approval
                auto_approved_task = await task_service.review_task(
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
            # Above threshold: need manual approval, check if we should send email
            logger.info(
                "Task {} requires manual approval: required_storage={:.2f}GB >= threshold={}GB",
                task.id,
                required_storage_gb,
                auto_approve_threshold_gb,
            )
            if task_approval_push and notification_email:
                should_send_email = True
    else:
        # Auto-approval is disabled
        if task_approval_push and notification_email:
            should_send_email = True

    # Send approval notification email if needed
    if should_send_email:
        logger.info("Sending approval notification email for task {}", task.id)
        await task_notification_service.send_task_approval_notification(
            task=task,
            notification_emails=notification_email,
        )

    return TaskDetailResponse(
        data=TaskResponse(
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
            total_storage=task.total_storage,
            required_file_count=task.required_file_count,
            total_file_count=task.total_file_count,
            repo_items=task.repo_items or [],
            commit_hash=task.commit_hash,
        )
    )


@router.post("/{task_id}/review", response_model=TaskDetailResponse)
async def review_task(
    task_id: int,
    request: TaskReviewRequest,
    admin_user: AdminUserDep,
    current_user: Annotated[User, Depends(get_current_user)],
) -> TaskDetailResponse:
    """Review (approve or reject) a pending approval task.

    Only admin users can review tasks. Approved tasks move to PENDING status
    and become eligible for worker pickup. Rejected tasks are marked as CANCELLED.

    Args:
        task_id: Task ID to review
        request: Review request with approved flag and optional notes
        admin_user: Current admin user (dependency enforces admin role)
        current_user: Current user entity for reviewer ID

    Returns:
        Updated task information

    Raises:
        HTTPException: If task not found, not in PENDING_APPROVAL status,
                      or user is not admin
    """
    task_service = TaskService()

    try:
        task = await task_service.review_task(
            task_id=task_id,
            approved=request.approved,
            reviewer_user_id=current_user.id,
            review_notes=request.notes,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )

    return TaskDetailResponse(
        data=TaskResponse(
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
            total_storage=task.total_storage,
            required_file_count=task.required_file_count,
            total_file_count=task.total_file_count,
            repo_items=task.repo_items or [],
            commit_hash=task.commit_hash,
        )
    )


@router.post("/{task_id}/cancel", response_model=TaskDetailResponse)
async def cancel_task(
    task_id: int,
    current_user: CurrentUserToken,
    db: DbDep,
    user_service: UserServiceDep,
) -> TaskDetailResponse:
    """Cancel a running or pending task.

    The task creator or an admin can cancel a task.
    - running tasks: status → canceling (worker will terminate gracefully)
    - pending tasks: status → cancelled (immediate)

    Args:
        task_id: Task ID to cancel
        current_user: Current authenticated user (email from JWT)
        db: Database session
        user_service: User service dependency

    Returns:
        Updated task information

    Raises:
        HTTPException: If task not found, not in a cancellable state, or user lacks permission
    """
    task_service = TaskService()
    task = await task_service.get_task(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )

    # Resolve the current user entity
    user = await user_service.get_by_email(current_user.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Permission: task creator or admin
    is_admin = user.role == "admin"
    is_creator = task.creator_user_id == user.id
    if not (is_admin or is_creator):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: only the task creator or an admin can cancel this task",
        )

    # Only running or pending tasks can be cancelled
    if task.status not in (TaskStatus.RUNNING, TaskStatus.PENDING):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Task cannot be cancelled in status '{task.status.value}'",
        )

    success = await task_service.request_cancel(task_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to cancel task",
        )

    # Send cancellation notification email to task creator
    from services import task_notification_service

    await task_notification_service.send_task_notification(
        task=task,
        status="cancelled",
    )

    # Return updated task
    updated_task = await task_service.get_task(task_id)
    if not updated_task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )
    creator = await UserRepository(db).get_by_id(updated_task.creator_user_id)
    if creator:
        creator_user = TaskCreatorUser(
            id=creator.id, name=creator.name, email=creator.email
        )
    else:
        creator_user = None

    return TaskDetailResponse(
        data=TaskResponse(
            id=updated_task.id,
            source=updated_task.source,
            repo_id=updated_task.repo_id,
            repo_type=updated_task.repo_type,
            revision=updated_task.revision,
            hf_endpoint=updated_task.hf_endpoint,
            status=updated_task.status.value,
            error_message=updated_task.error_message,
            created_at=updated_task.created_at,
            reviewed_at=updated_task.reviewed_at,
            updated_at=updated_task.updated_at,
            started_at=updated_task.started_at,
            completed_at=updated_task.completed_at,
            pinned_at=updated_task.pinned_at,
            required_storage=updated_task.required_storage,
            creator_user_id=updated_task.creator_user_id,
            creator_user=creator_user,
            total_storage=updated_task.total_storage,
            required_file_count=updated_task.required_file_count,
            total_file_count=updated_task.total_file_count,
            repo_items=updated_task.repo_items or [],
            commit_hash=updated_task.commit_hash,
        )
    )


@router.post("/{task_id}/pin", response_model=TaskDetailResponse)
async def pin_task(
    task_id: int,
    current_user: CurrentUserDep,
    db: DbDep,
) -> TaskDetailResponse:
    """Pin a pending task to give it higher priority.

    Only task creator or admin users can pin tasks. Pinned tasks are executed before
    non-pinned tasks. When multiple tasks are pinned, the most recently
    pinned task is executed first (LIFO order).

    Args:
        task_id: Task ID to pin
        current_user: Current authenticated user
        db: Database session

    Returns:
        Updated task information

    Raises:
        HTTPException: If task not found, not in PENDING status, or user is not authorized
    """
    # Check if user is authorized (creator or admin)
    task_repo = TaskRepository(db)
    task = await task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )
    if task.creator_user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only task creator or admin can pin this task",
        )

    task_service = TaskService()

    try:
        task = await task_service.pin_task(task_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )

    creator = await UserRepository(db).get_by_id(task.creator_user_id)
    if creator:
        creator_user = TaskCreatorUser(
            id=creator.id, name=creator.name, email=creator.email
        )
    else:
        creator_user = None

    return TaskDetailResponse(
        data=TaskResponse(
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
            repo_items=task.repo_items or [],
            commit_hash=task.commit_hash,
        )
    )


@router.post("/{task_id}/unpin", response_model=TaskDetailResponse)
async def unpin_task(
    task_id: int,
    current_user: CurrentUserDep,
    db: DbDep,
) -> TaskDetailResponse:
    """Unpin a pinned task to remove its higher priority.

    Only task creator or admin users can unpin tasks. This removes the pinned status from
    a task, returning it to normal priority.

    Args:
        task_id: Task ID to unpin
        current_user: Current authenticated user
        db: Database session

    Returns:
        Updated task information

    Raises:
        HTTPException: If task not found, not in PENDING status, or user is not authorized
    """
    # Check if user is authorized (creator or admin)
    task_repo = TaskRepository(db)
    task = await task_repo.get_by_id(task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )
    if task.creator_user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only task creator or admin can unpin this task",
        )

    task_service = TaskService()

    try:
        task = await task_service.unpin_task(task_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )

    creator = await UserRepository(db).get_by_id(task.creator_user_id)
    if creator:
        creator_user = TaskCreatorUser(
            id=creator.id, name=creator.name, email=creator.email
        )
    else:
        creator_user = None

    return TaskDetailResponse(
        data=TaskResponse(
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
            repo_items=task.repo_items or [],
            commit_hash=task.commit_hash,
        )
    )


@router.post("/{task_id}/retry", response_model=TaskDetailResponse)
async def retry_task(
    task_id: int,
    current_user: CurrentUserToken,
    db: DbDep,
    user_service: UserServiceDep,
) -> TaskDetailResponse:
    """Retry a failed task by creating a new task with the same configuration.

    The new task is automatically approved and does not require admin review.

    Requirements:
    - Task status must be FAILED
    - Task must have completed within the last 7 days

    Args:
        task_id: ID of the failed task to retry
        current_user: Current authenticated user
        db: Database session
        user_service: User service dependency

    Returns:
        Newly created task information

    Raises:
        HTTPException: If task not found, not failed, or completed more than 7 days ago
    """
    # Resolve the current user entity
    user = await user_service.get_by_email(current_user.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    task_service = TaskService()
    original_task = await task_service.get_task(task_id)

    if not original_task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )

    # Validate task status
    if original_task.status != TaskStatus.FAILED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Task cannot be retried: status is '{original_task.status.value}', not 'failed'",
        )

    # Validate completion time (must be within 7 days)
    if original_task.completed_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task cannot be retried: no completion time recorded",
        )

    seven_days_ago = datetime.now() - timedelta(days=7)
    if original_task.completed_at < seven_days_ago:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Task cannot be retried: completed more than 7 days ago (completed at {original_task.completed_at.isoformat()})",
        )

    # Permission: task creator or admin
    is_admin = user.role == "admin"
    is_creator = original_task.creator_user_id == user.id
    if not (is_admin or is_creator):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: only the task creator or an admin can retry this task",
        )

    # Check for existing active tasks with same repo_id and source
    task_repo = TaskRepository(db)
    existing_task = await task_repo.get_active_download_task(
        repo_id=original_task.repo_id,
        source=original_task.source,
    )
    if existing_task:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An active task for repository '{original_task.repo_id}' already exists. "
            f"Task ID: {existing_task.id}, Status: {existing_task.status}. "
            f"Please wait for it to complete or cancel it before retrying.",
        )

    # Create new task with the same configuration
    new_task = await task_service.add_new_task(
        source=original_task.source,
        repo_id=original_task.repo_id,
        repo_type=original_task.repo_type,
        revision=original_task.revision,
        commit_hash=original_task.commit_hash,
        hf_endpoint=original_task.hf_endpoint,
        access_token=original_task.access_token,
        creator_user_id=user.id,
        total_file_count=original_task.total_file_count,
        required_file_count=original_task.required_file_count,
        total_storage=original_task.total_storage,
        required_storage=original_task.required_storage,
        repo_items=original_task.repo_items,
    )

    # Auto-approve the new task (skip admin review)
    approved_task = await task_service.review_task(
        task_id=new_task.id,
        approved=True,
        reviewer_user_id=user.id,
        review_notes=f"Auto-approved retry of failed task {task_id}",
    )

    if approved_task:
        new_task = approved_task

    logger.info(
        "User {} retried failed task {} as new task {}", user.id, task_id, new_task.id
    )

    # Get creator info for response
    creator = await UserRepository(db).get_by_id(new_task.creator_user_id)
    creator_user = (
        TaskCreatorUser(id=creator.id, name=creator.name, email=creator.email)
        if creator
        else None
    )

    return TaskDetailResponse(
        data=TaskResponse(
            id=new_task.id,
            source=new_task.source,
            repo_id=new_task.repo_id,
            repo_type=new_task.repo_type,
            revision=new_task.revision,
            hf_endpoint=new_task.hf_endpoint,
            status=new_task.status.value,
            error_message=new_task.error_message,
            created_at=new_task.created_at,
            reviewed_at=new_task.reviewed_at,
            updated_at=new_task.updated_at,
            started_at=new_task.started_at,
            completed_at=new_task.completed_at,
            pinned_at=new_task.pinned_at,
            required_storage=new_task.required_storage,
            creator_user_id=new_task.creator_user_id,
            creator_user=creator_user,
            total_storage=new_task.total_storage,
            required_file_count=new_task.required_file_count,
            total_file_count=new_task.total_file_count,
            repo_items=new_task.repo_items or [],
            commit_hash=new_task.commit_hash,
        )
    )


def _get_task_key(task_id: int) -> str:
    """Get Redis key for task progress."""
    return f"task_progress:{task_id}"


def _get_files_key(task_id: int) -> str:
    """Get Redis key prefix for task files (without global prefix).

    Returns key without the global KEY_PREFIX because cache_service
    adds its own prefix automatically in keys() and get() methods.
    """
    return f"task_files:{task_id}"


@router.get("/{task_id}/progress", response_model=TaskProgressResponse)
async def get_task_progress(
    task_id: int,
) -> TaskProgressResponse:
    """Get task file-level progress.

    Returns real-time progress data for a running task, including:
    - Overall progress (percentage, bytes, files)
    - Current download speed and ETA
    - Individual file progress details

    - **task_id**: Task ID to query

    Returns 404 if:
    - Task progress data not found (task not started or already completed)
    """
    # Get task summary from Redis
    task_key = _get_task_key(task_id)
    task_data = await cache_service.get(task_key)

    if not task_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task progress not found for task {task_id}. "
            "The task may not have started or has already completed.",
        )

    # Get all file progress entries
    files_key_pattern = f"{_get_files_key(task_id)}:*"
    file_keys = await cache_service.keys(files_key_pattern)

    files: list[FileProgressItem] = []
    for key in file_keys:
        file_data = await cache_service.get(key)
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

    # Sort files by path for consistent ordering
    files.sort(key=lambda x: x.path)

    # 根据文件进度实时计算整体进度
    total_bytes = sum(f.total_bytes for f in files)
    downloaded_bytes = sum(f.downloaded_bytes for f in files)
    completed_files = sum(1 for f in files if f.status == "completed")

    # 计算整体进度百分比（基于字节）
    progress_percent = (
        (downloaded_bytes / total_bytes * 100) if total_bytes > 0 else 0.0
    )

    # Build response
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
