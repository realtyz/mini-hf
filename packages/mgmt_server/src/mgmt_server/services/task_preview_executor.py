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
from database.db_models import Source
from loguru import logger
from services.huggingface import HuggingfaceService, RepoFile, RepoFolder
from services.huggingface.utils import filter_repo_objects
from services.modelscope import ModelScopeService
from services.task import TaskService
from sqlalchemy.exc import DatabaseError

from mgmt_server.core.exceptions import ValidationError
from mgmt_server.utils.token_utils import encode_access_token
from mgmt_server.services.repo_service import RepoService
from mgmt_server.services.ms_repo_service import MsRepoService

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
    upstream_sha: str | None = None


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


# ------------------------------------------------------------------
# ModelScope helpers (dict-based, not RepoFile/RepoFolder)
# ------------------------------------------------------------------


def build_ms_preview_items(
    files: list[dict],
    directories: list[dict],
    required_file_paths: set[str],
) -> list[dict[str, Any]]:
    """Build preview items from ModelScope file-tree dicts.

    Mirrors ``build_preview_items`` but reads dict keys (Path/Size) instead of
    RepoFile/RepoFolder attributes.
    """
    preview_items: list[dict[str, Any]] = []
    required_dirs: set[str] = set()
    for file_path in required_file_paths:
        parts = file_path.split("/")
        for i in range(1, len(parts)):
            required_dirs.add("/".join(parts[:i]))

    for directory in sorted(directories, key=lambda d: d.get("Path", "")):
        path = directory.get("Path", "")
        preview_items.append(
            {
                "path": path,
                "size": 0,
                "type": "directory",
                "required": path in required_dirs,
            }
        )

    for file in sorted(files, key=lambda f: f.get("Path", "")):
        path = file.get("Path", "")
        preview_items.append(
            {
                "path": path,
                "size": int(file.get("Size", 0)),
                "type": "file",
                "required": path in required_file_paths,
            }
        )

    return preview_items


async def _fetch_ms_repo_tree(
    ms_service: ModelScopeService,
    repo_id: str,
    repo_type: str,
    revision: str,
    update_state: ProgressCallback,
    task_logger: Any,
    upstream_sha: str | None = None,
) -> tuple[list[dict], list[dict], str]:
    """Fetch repo file tree from ModelScope.

    If upstream_sha is provided (from validate_repo_access), the resolve_commit
    call is skipped and only get_repo_tree is called.
    """
    await update_state("fetching", "连接 ModelScope...", 5.0)
    await update_state("fetching", "获取仓库文件树...", 10.0)

    if upstream_sha is not None:
        # commit already resolved by validate_repo_access - just fetch tree
        entries = await ms_service.get_repo_tree(repo_id, repo_type, revision)
        commit_hash = upstream_sha
        task_logger.debug(
            "Using upstream_sha from validate_repo_access, skipping resolve_commit"
        )
    else:
        commit_hash, entries, _committed_at = await ms_service.resolve_commit(
            repo_id, repo_type, revision
        )

    task_logger.info("Fetched {} entries from ModelScope repository", len(entries))
    # entries: list[dict] with keys Path/Type/Size/...
    files = [e for e in entries if e.get("Type") == "blob"]
    directories = [e for e in entries if e.get("Type") == "tree"]
    return files, directories, commit_hash


async def _process_ms_files(
    files: list[dict],
    directories: list[dict],
    full_download: bool,
    allow_patterns: list[str] | None,
    ignore_patterns: list[str] | None,
    update_state: ProgressCallback,
    task_logger: Any,
) -> ProcessedFilesResult:
    """Filter MS files, build preview items, and compute storage stats.

    Uses the source-agnostic ``filter_repo_objects`` with ``key=lambda e: e["Path"]``.
    """
    total_storage = sum(int(f.get("Size", 0)) for f in files)
    total_file_count = len(files)

    await update_state("processing", f"Processing {total_file_count} files...", 50.0)

    if full_download:
        required_file_paths = {f.get("Path", "") for f in files}
        task_logger.debug(
            "Full download mode: all {} files required", len(required_file_paths)
        )
    else:
        task_logger.info(
            "Filtering files with allow_patterns={}, ignore_patterns={}",
            allow_patterns,
            ignore_patterns,
        )
        filtered_files = list(
            filter_repo_objects(
                files,
                allow_patterns=allow_patterns,
                ignore_patterns=ignore_patterns,
                key=lambda e: e.get("Path", ""),
            )
        )
        required_file_paths = {f.get("Path", "") for f in filtered_files}
        task_logger.info(
            "Filtered: {} of {} files match patterns",
            len(required_file_paths),
            len(files),
        )

    required_storage = sum(
        int(f.get("Size", 0)) for f in files if f.get("Path", "") in required_file_paths
    )
    required_file_count = len(required_file_paths)

    await update_state("processing", "Building preview data...", 80.0)

    preview_items = build_ms_preview_items(files, directories, required_file_paths)

    return ProcessedFilesResult(
        required_file_paths=required_file_paths,
        total_storage=total_storage,
        total_file_count=total_file_count,
        required_storage=required_storage,
        required_file_count=required_file_count,
        preview_items=preview_items,
    )


def _annotate_cached_status(
    preview_items: list[dict[str, Any]],
    cached_paths: set[str],
) -> None:
    """Set is_cached on file-type items in-place."""
    for item in preview_items:
        if item["type"] == "file":
            item["is_cached"] = item["path"] in cached_paths
        else:
            item["is_cached"] = None


async def check_cache_status_with_fresh_session(
    source: str,
    repo_id: str,
    repo_type: str,
    revision: str,
    commit_hash: str,
    required_file_paths: set[str],
    task_logger: Any,
) -> tuple[bool, str | None, set[str]]:
    """Check cache status using a fresh session (for background tasks).

    Standalone function - does not depend on any request-scoped objects.
    Selects RepoService (HF) or MsRepoService (MS) by source.
    """
    from database import new_session

    try:
        async with new_session() as session:
            if source == Source.MODELSCOPE.value:
                repo_service = MsRepoService(session, task_service=TaskService(session))
            else:
                repo_service = RepoService(session, task_service=TaskService(session))
            all_cached, cached_commit_hash, cached_paths = await repo_service.check_cached_status(
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
                commit_hash=commit_hash,
                required_file_paths=required_file_paths,
            )
            await session.commit()
            return all_cached, cached_commit_hash, cached_paths
    except (ConnectionError, OSError, TimeoutError, DatabaseError) as e:
        task_logger.warning("Failed to check cache status: {}", e)
        return False, None, set()


ProgressCallback = Callable[..., Any]


async def _fetch_repo_tree(
    hf_service: HuggingfaceService,
    repo_id: str,
    repo_type: str,
    revision: str,
    update_state: ProgressCallback,
    task_logger: Any,
    upstream_sha: str | None = None,
) -> tuple[list[RepoFile], list[RepoFolder], str]:
    """Fetch repo info and file tree from HuggingFace.

    If upstream_sha is provided (from validate_repo_access), the get_repo_info
    call is skipped.
    """
    await update_state("fetching", "Connecting to HuggingFace Hub...", 5.0)
    await update_state("fetching", "Fetching repository file tree...", 10.0)

    if upstream_sha is not None:
        commit_hash = upstream_sha
        task_logger.debug("Using upstream_sha from validate_repo_access, skipping get_repo_info")
    else:
        repo_info = await hf_service.get_repo_info(
            repo_id=repo_id, repo_type=repo_type, revision=revision
        )
        if repo_info.sha is None:
            raise ValidationError("Repository info missing commit hash")
        commit_hash = repo_info.sha

    items = await hf_service.get_tree(
        repo_id=repo_id,
        repo_type=repo_type,
        revision=revision,
    )
    task_logger.info("Fetched {} items from repository", len(items))

    files = [item for item in items if isinstance(item, RepoFile)]
    directories = [item for item in items if isinstance(item, RepoFolder)]
    return files, directories, commit_hash


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


def _build_result_payloads(
    result: PreviewResult,
    cache_key: str,
    encoded_token: str | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Build (cache_data, task_result) dicts from PreviewResult.

    Pure function — no side effects.
    """
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
        "items": list(result.preview_items),
        "all_required_cached": result.all_required_cached,
        "cached_commit_hash": result.cached_commit_hash,
    }

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
        "items": list(result.preview_items),
        "cache_key": cache_key,
        "all_required_cached": result.all_required_cached,
        "cached_commit_hash": result.cached_commit_hash,
    }

    return cache_data, task_result


async def _finalize_result(
    cache: CacheService,
    result: PreviewResult,
    update_state: ProgressCallback,
    task_logger: Any,
) -> None:
    """Store preview result in cache and update task state."""
    cache_key = secrets.token_urlsafe(16)
    encoded_token = encode_access_token(result.access_token)

    cache_data, task_result = _build_result_payloads(result, cache_key, encoded_token)

    await cache.set(CacheKeys.preview_result.key(cache_key), cache_data, ttl=CacheKeys.preview_result.ttl)

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
        if config.source == Source.MODELSCOPE.value:
            # ModelScopeService holds an httpx.AsyncClient - must close via async with
            async with ModelScopeService(
                token=config.access_token, endpoint=config.actual_endpoint
            ) as ms_service:
                files, directories, commit_hash = await _fetch_ms_repo_tree(
                    ms_service,
                    config.repo_id,
                    config.repo_type,
                    config.revision,
                    _update_state,
                    task_logger,
                    upstream_sha=config.upstream_sha,
                )

                processed = await _process_ms_files(
                    files,
                    directories,
                    config.full_download,
                    config.allow_patterns,
                    config.ignore_patterns,
                    _update_state,
                    task_logger,
                )
        else:
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
                upstream_sha=config.upstream_sha,
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
            cached_paths,
        ) = await check_cache_status_with_fresh_session(
            config.source,
            config.repo_id,
            config.repo_type,
            config.revision,
            commit_hash,
            processed.required_file_paths,
            task_logger,
        )

        _annotate_cached_status(processed.preview_items, cached_paths)

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
