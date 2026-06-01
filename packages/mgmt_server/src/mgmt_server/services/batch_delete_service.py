"""Batch delete operation service with Redis-backed progress tracking."""

import asyncio
import uuid
from datetime import datetime, timezone

from cache import cache_service
from cache.services.cache import CacheService
from database.core import new_session
from loguru import logger
from services.task import TaskService

from mgmt_server.api.v1.schemas.repos import BatchDeleteRepoItem
from mgmt_server.core.exceptions import ConflictError, NotFoundError
from mgmt_server.services.repo_service import RepoService

_DEFAULT_TTL = 86400  # 24 hours
_BATCH_CONCURRENCY = 5


class BatchDeleteService:
    """Orchestrates async batch delete operations with Redis state tracking."""

    def __init__(self, cache: CacheService | None = None):
        self._cache = cache or cache_service

    def _key(self, operation_id: str) -> str:
        return f"batch_delete:{operation_id}"

    async def start_operation(self, repo_ids: list[str]) -> tuple[str, list[str]]:
        """Initialize operation state in Redis, return (operation_id, unique_ids)."""
        # Deduplicate while preserving order
        seen: set[str] = set()
        unique_ids: list[str] = []
        for rid in repo_ids:
            if rid not in seen:
                seen.add(rid)
                unique_ids.append(rid)

        operation_id = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc).isoformat()
        data = {
            "operation_id": operation_id,
            "status": "processing",
            "total_requested": len(unique_ids),
            "total_deleted": 0,
            "total_failed": 0,
            "results": [],
            "created_at": now,
            "updated_at": now,
        }
        await self._cache.set(self._key(operation_id), data, ttl=_DEFAULT_TTL)
        return operation_id, unique_ids

    def create_background_task(
        self, operation_id: str, repo_ids: list[str]
    ):
        """Return a callable for FastAPI BackgroundTasks.

        Each repo_id is processed in its own DB transaction so that a
        failure in one does not roll back the work of others.
        """

        async def _run() -> None:
            semaphore = asyncio.Semaphore(_BATCH_CONCURRENCY)

            async def _delete_one(repo_id: str) -> BatchDeleteRepoItem:
                async with semaphore:
                    try:
                        async with new_session() as session:
                            task_service = TaskService(session)
                            repo_service = RepoService(
                                session, task_service=task_service
                            )
                            result = await repo_service.delete_repo(repo_id)
                            await session.commit()
                            return BatchDeleteRepoItem(
                                repo_id=result.repo_id,
                                deleted=result.deleted,
                                snapshots_deleted=result.snapshots_deleted,
                                tree_items_deleted=result.tree_items_deleted,
                                blobs_deleted=result.blobs_deleted,
                                blobs_failed=result.blobs_failed,
                                profile_deleted=result.profile_deleted,
                            )
                    except (NotFoundError, ConflictError) as e:
                        return BatchDeleteRepoItem(
                            repo_id=repo_id, deleted=False, error=e.message
                        )
                    except asyncio.CancelledError:
                        raise
                    except Exception as e:
                        logger.exception("Unexpected error deleting {}", repo_id)
                        return BatchDeleteRepoItem(
                            repo_id=repo_id, deleted=False, error=str(e)
                        )

            results: list[BatchDeleteRepoItem] = []
            for repo_id in repo_ids:
                item = await _delete_one(repo_id)
                results.append(item)

                deleted = sum(1 for r in results if r.deleted)
                failed = len(results) - deleted

                existing = await self._cache.get(self._key(operation_id))
                if existing is not None:
                    existing["results"] = [r.model_dump() for r in results]
                    existing["total_deleted"] = deleted
                    existing["total_failed"] = failed
                    existing["updated_at"] = datetime.now(timezone.utc).isoformat()
                    await self._cache.set(
                        self._key(operation_id), existing, ttl=_DEFAULT_TTL
                    )

            # Mark completed
            existing = await self._cache.get(self._key(operation_id))
            if existing is not None:
                existing["status"] = "completed"
                existing["updated_at"] = datetime.now(timezone.utc).isoformat()
                await self._cache.set(
                    self._key(operation_id), existing, ttl=_DEFAULT_TTL
                )

        return _run

    async def get_status(self, operation_id: str) -> dict | None:
        """Get current operation state from Redis."""
        return await self._cache.get(self._key(operation_id))
