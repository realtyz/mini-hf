"""Background executor for async repository preview tasks.

Contains standalone functions that create their own sessions and do not
depend on any request-scoped objects.
"""

from __future__ import annotations

import secrets
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, NamedTuple

from cache.keys import CacheKeys
from cache.services.cache import CacheService
from loguru import logger
from services.huggingface import HuggingfaceService, RepoFile, RepoFolder
from services.task import TaskService
from sqlalchemy.exc import DatabaseError

from mgmt_server.core.exceptions import ValidationError
from mgmt_server.utils.token_utils import encode_access_token
from mgmt_server.services.repo_service import RepoService

@dataclass
class PreviewTaskConfig:
    """Input configuration for a preview task execution."""

    task_id: str
    source: str
    repo_id: str
    repo_type: str
    revision: str
    access_token: str | None
    full_download: bool
    allow_patterns: list[str] | None
    ignore_patterns: list[str] | None
    actual_endpoint: str
    hf_endpoint: str | None


@dataclass
class PreviewResult:
    """Aggregated result data for storing in cache."""

    source: str
    repo_id: str
    repo_type: str
    revision: str
    commit_hash: str
    hf_endpoint: str | None
    access_token: str | None
    preview_items: list[dict[str, Any]]
    all_required_cached: bool
    cached_commit_hash: str | None
    total_storage: int
    total_file_count: int
    required_storage: int
    required_file_count: int


class ProcessedFilesResult(NamedTuple):
    """Result of file processing: required paths, storage stats, and preview items."""

    required_file_paths: set[str]
    total_storage: int
    total_file_count: int
    required_storage: int
    required_file_count: int
    preview_items: list[dict[str, Any]]


def calculate_required_files(
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


def build_preview_items(
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


async def check_cache_status_with_fresh_session(
    repo_id: str,
    repo_type: str,
    revision: str,
    required_file_paths: set[str],
    task_logger: Any,
) -> tuple[bool, str | None]:
    """Check cache status using a fresh session (for background tasks).

    Standalone function — does not depend on any request-scoped objects.
    """
    from database import new_session

    try:
        async with new_session() as session:
            repo_service = RepoService(session, task_service=TaskService(session))
            all_cached, commit_hash = await repo_service.check_cached_status(
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                required_file_paths=required_file_paths,
            )
            await session.commit()
            return all_cached, commit_hash
    except (ConnectionError, OSError, TimeoutError, DatabaseError) as e:
        task_logger.warning("Failed to check cache status: {}", e)
        return False, None


ProgressCallback = Callable[..., Any]


async def _fetch_repo_tree(
    hf_service: HuggingfaceService,
    repo_id: str,
    repo_type: str,
    revision: str,
    update_state: ProgressCallback,
    task_logger: Any,
) -> tuple[list[RepoFile], list[RepoFolder], str]:
    """Fetch repo info and file tree from HuggingFace."""
    await update_state("fetching", "Connecting to HuggingFace Hub...", 5.0)
    await update_state("fetching", "Fetching repository file tree...", 10.0)

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
    if repo_info.sha is None:
        raise ValidationError("Repository info missing commit hash")
    return files, directories, repo_info.sha


async def _process_files(
    files: list[RepoFile],
    directories: list[RepoFolder],
    full_download: bool,
    allow_patterns: list[str] | None,
    ignore_patterns: list[str] | None,
    hf_service: HuggingfaceService,
    update_state: ProgressCallback,
    task_logger: Any,
) -> ProcessedFilesResult:
    """Filter files, build preview items, and compute storage stats."""
    total_storage = sum(f.size for f in files)
    total_file_count = len(files)

    await update_state("processing", f"Processing {total_file_count} files...", 50.0)

    required_file_paths = calculate_required_files(
        files, full_download, allow_patterns, ignore_patterns, hf_service, task_logger
    )

    required_storage = sum(f.size for f in files if f.path in required_file_paths)
    required_file_count = len(required_file_paths)

    await update_state("processing", "Building preview data...", 80.0)

    preview_items = build_preview_items(files, directories, required_file_paths)

    return ProcessedFilesResult(
        required_file_paths=required_file_paths,
        total_storage=total_storage,
        total_file_count=total_file_count,
        required_storage=required_storage,
        required_file_count=required_file_count,
        preview_items=preview_items,
    )


async def _finalize_result(
    cache: CacheService,
    result: PreviewResult,
    update_state: ProgressCallback,
    task_logger: Any,
) -> None:
    """Store preview result in cache and update task state."""
    cache_key = secrets.token_urlsafe(16)
    encoded_token = encode_access_token(result.access_token)

    cache_data = {
        "source": result.source,
        "repo_id": result.repo_id,
        "repo_type": result.repo_type,
        "revision": result.revision,
        "commit_hash": result.commit_hash,
        "hf_endpoint": result.hf_endpoint,
        "access_token": encoded_token,
        "total_storage": result.total_storage,
        "total_file_count": result.total_file_count,
        "required_storage": result.required_storage,
        "required_file_count": result.required_file_count,
        "items": result.preview_items,
        "all_required_cached": result.all_required_cached,
        "cached_commit_hash": result.cached_commit_hash,
    }
    await cache.set(CacheKeys.preview_result.key(cache_key), cache_data, ttl=CacheKeys.preview_result.ttl)

    task_result = {
        "repo_id": result.repo_id,
        "repo_type": result.repo_type,
        "revision": result.revision,
        "commit_hash": result.commit_hash,
        "hf_endpoint": result.hf_endpoint,
        "total_storage": result.total_storage,
        "total_file_count": result.total_file_count,
        "required_storage": result.required_storage,
        "required_file_count": result.required_file_count,
        "items": result.preview_items,
        "cache_key": cache_key,
        "all_required_cached": result.all_required_cached,
        "cached_commit_hash": result.cached_commit_hash,
    }

    await update_state(
        "completed", "Preview completed successfully", 100.0, result=task_result
    )

    task_logger.info(
        "Preview completed successfully. Result: {}/{} files, {}/{} bytes, cache_key={}",
        result.required_file_count,
        result.total_file_count,
        result.required_storage,
        result.total_storage,
        cache_key,
    )


async def execute_preview_task(
    config: PreviewTaskConfig,
    cache: CacheService,
) -> None:
    """Execute preview task in background.

    Standalone function — creates its own sessions so it does not depend
    on any request-scoped objects.
    """
    task_logger = logger.bind(
        task_id=config.task_id,
        repo_id=config.repo_id,
        repo_type=config.repo_type,
        revision=config.revision,
    )
    task_logger.info("Starting preview execution")

    async def _update_state(
        status: str,
        progress_message: str,
        progress_percent: float,
        **kwargs: Any,
    ) -> None:
        state = {
            "status": status,
            "repo_id": config.repo_id,
            "repo_type": config.repo_type,
            "revision": config.revision,
            "progress_message": progress_message,
            "progress_percent": progress_percent,
        }
        state.update(kwargs)
        await cache.set(
            CacheKeys.preview_task.key(config.task_id),
            state,
            ttl=CacheKeys.preview_task.ttl,
        )

    try:
        hf_service = HuggingfaceService(
            token=config.access_token, endpoint=config.actual_endpoint
        )

        files, directories, commit_hash = await _fetch_repo_tree(
            hf_service,
            config.repo_id,
            config.repo_type,
            config.revision,
            _update_state,
            task_logger,
        )

        processed = await _process_files(
            files,
            directories,
            config.full_download,
            config.allow_patterns,
            config.ignore_patterns,
            hf_service,
            _update_state,
            task_logger,
        )

        (
            all_required_cached,
            cached_commit_hash,
        ) = await check_cache_status_with_fresh_session(
            config.repo_id,
            config.repo_type,
            config.revision,
            processed.required_file_paths,
            task_logger,
        )

        if all_required_cached:
            task_logger.info(
                "All {} required files are already cached",
                processed.required_file_count,
            )

        result = PreviewResult(
            source=config.source,
            repo_id=config.repo_id,
            repo_type=config.repo_type,
            revision=config.revision,
            commit_hash=commit_hash,
            hf_endpoint=config.hf_endpoint,
            access_token=config.access_token,
            preview_items=processed.preview_items,
            all_required_cached=all_required_cached,
            cached_commit_hash=cached_commit_hash,
            total_storage=processed.total_storage,
            total_file_count=processed.total_file_count,
            required_storage=processed.required_storage,
            required_file_count=processed.required_file_count,
        )

        await _finalize_result(cache, result, _update_state, task_logger)

    except Exception as e:
        await _update_state("failed", "Preview failed", 0.0, error_message=str(e))
        task_logger.opt(exception=True).error("Preview failed")
