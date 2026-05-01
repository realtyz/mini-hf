"""Task service with business logic."""

from datetime import datetime
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from loguru import logger
from database.db_models import Task, TaskStatus
from database.db_repositories import TaskRepository


class TaskService:
    """Task queue service with business logic.

    Database operations are delegated to TaskRepository.
    Session and transaction management are handled by the caller
    (FastAPI unit_of_work dependency or worker's explicit commit).
    """

    def __init__(self, session: AsyncSession):
        """Initialize the task service.

        Args:
            session: Async SQLAlchemy session (required). The caller owns
                     transaction boundaries — commit/rollback/close.
        """
        self._session = session
        self._repo = TaskRepository(session)
        self._logger = logger

    async def add_new_task(
        self,
        source: str,
        repo_id: str,
        revision: str,
        repo_type: str,
        creator_user_id: int,
        access_token: str | None = None,
        total_storage: int = 0,
        required_file_count: int = 0,
        total_file_count: int = 0,
        repo_items: list | None = None,
        commit_hash: str | None = None,
        required_storage: int = 0,
        hf_endpoint: str | None = None,
    ) -> Task:
        """Create a new task.

        Args:
            source: Repository source ('huggingface' or 'modelscope')
            repo_id: Repository ID to download
            revision: Repository revision/commit to download
            repo_type: Repository type ('model' or 'dataset')
            creator_user_id: User ID who created the task
            access_token: Optional access token for authentication
            total_storage: Total storage size in bytes
            required_file_count: Number of files to download after filtering
            total_file_count: Total number of files in repository
            repo_items: List of repository file items
            commit_hash: Commit hash of the revision
            required_storage: Required storage size in bytes after filtering
            hf_endpoint: HuggingFace endpoint URL

        Returns:
            Created task instance
        """
        task = await self._repo.add(
            source=source,
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
            hf_endpoint=hf_endpoint,
            access_token=access_token,
            creator_user_id=creator_user_id,
            total_storage=total_storage,
            required_file_count=required_file_count,
            total_file_count=total_file_count,
            repo_items=repo_items,
            commit_hash=commit_hash,
            required_storage=required_storage,
        )
        self._logger.debug("Created task {}: {} ({})", task.id, repo_id, source)
        return task

    async def get_next_task(self, batch_size: int = 1) -> List[Task]:
        """Dequeue pending tasks for worker processing.

        Uses FOR UPDATE SKIP LOCKED for concurrent safety.

        Args:
            batch_size: Number of tasks to fetch

        Returns:
            List of tasks with status updated to RUNNING
        """
        tasks = await self._repo.get_next_for_worker(batch_size)
        if tasks:
            self._logger.debug("Worker picked up tasks: {}", [t.id for t in tasks])
        return tasks

    async def start_task(self, task_id: int) -> None:
        """Mark a task as started.

        Args:
            task_id: Task ID
        """
        await self._repo.update_status(
            task_id, TaskStatus.RUNNING, started_at=datetime.now()
        )
        self._logger.debug("Started task {}", task_id)

    async def complete(self, task_id: int, result: Optional[dict] = None) -> None:
        """Mark a task as completed.

        Args:
            task_id: Task ID
            result: Optional result data (no longer stored)
        """
        await self._repo.update_status(
            task_id,
            TaskStatus.COMPLETED,
            completed_at=datetime.now(),
            clear_pinned=True,
        )
        self._logger.debug("Completed task {}", task_id)

    async def fail(self, task_id: int, error_message: str) -> None:
        """Mark a task as failed.

        Args:
            task_id: Task ID
            error_message: Error description
        """
        await self._repo.update_status(
            task_id,
            TaskStatus.FAILED,
            error_message=error_message,
            completed_at=datetime.now(),
            clear_pinned=True,
        )
        self._logger.debug("Failed task {}: {}", task_id, error_message)

    async def get_task(self, task_id: int) -> Optional[Task]:
        """Get task by ID.

        Args:
            task_id: Task ID

        Returns:
            Task instance or None
        """
        return await self._repo.get_by_id(task_id)

    async def request_cancel(self, task_id: int) -> bool:
        """Request cancellation of a task.

        For running tasks, changes status to CANCELING so that the worker will
        detect and terminate the task gracefully.

        For pending tasks, changes status directly to CANCELLED.

        Args:
            task_id: Task ID

        Returns:
            True if cancellation was requested, False if task not found or not cancellable
        """
        task = await self._repo.get_by_id(task_id)
        if not task:
            return False

        now = datetime.now()

        if task.status == TaskStatus.RUNNING or task.status == TaskStatus.PAUSING:
            # Signal worker to stop gracefully
            await self._repo.update_status(task_id, TaskStatus.CANCELING)
            self._logger.info("Requested cancellation for task {}", task_id)
            return True

        elif task.status == TaskStatus.PENDING or task.status == TaskStatus.PAUSED:
            # Cancel immediately
            await self._repo.update_status(
                task_id,
                TaskStatus.CANCELLED,
                completed_at=now,
                clear_pinned=True,
            )
            self._logger.info("Cancelled pending/paused task {}", task_id)
            return True

        return False

    async def cancel(self, task_id: int) -> None:
        """Mark a task as cancelled (called by worker after graceful termination).

        Args:
            task_id: Task ID
        """
        await self._repo.update_status(
            task_id,
            TaskStatus.CANCELLED,
            completed_at=datetime.now(),
            clear_pinned=True,
        )
        self._logger.info("Task {} marked as cancelled", task_id)

    async def request_pause(self, task_id: int) -> bool:
        """Request pause of a task.

        For running tasks, changes status to PAUSING so the worker will
        detect and terminate the task gracefully after completing the
        current file.

        For pending tasks, changes status directly to PAUSED.

        Args:
            task_id: Task ID

        Returns:
            True if pause was requested, False if task not found or not pausable
        """
        task = await self._repo.get_by_id(task_id)
        if not task:
            return False

        if task.status == TaskStatus.RUNNING:
            await self._repo.update_status(task_id, TaskStatus.PAUSING)
            self._logger.info("Requested pause for running task {}", task_id)
            return True

        if task.status == TaskStatus.PENDING:
            await self._repo.update_status(
                task_id,
                TaskStatus.PAUSED,
                clear_pinned=True,
            )
            self._logger.info("Paused pending task {}", task_id)
            return True

        return False

    async def pause(self, task_id: int) -> None:
        """Mark a task as paused (called by worker after graceful termination).

        Args:
            task_id: Task ID
        """
        await self._repo.update_status(
            task_id,
            TaskStatus.PAUSED,
        )
        self._logger.info("Task {} marked as paused", task_id)

    async def request_resume(self, task_id: int) -> bool:
        """Resume a paused task by changing status to PENDING.

        Args:
            task_id: Task ID

        Returns:
            True if resumed, False if task not found or not in PAUSED status
        """
        task = await self._repo.get_by_id(task_id)
        if not task:
            return False

        if task.status == TaskStatus.PAUSED:
            await self._repo.update_status(
                task_id,
                TaskStatus.PENDING,
                reviewed_at=datetime.now(),
            )
            self._logger.info("Resumed task {}", task_id)
            return True

        return False

    async def review_task(
        self,
        task_id: int,
        approved: bool,
        reviewer_user_id: int,
        review_notes: str | None = None,
    ) -> Task | None:
        """Review (approve or reject) a pending approval task.

        Args:
            task_id: Task ID to review
            approved: True to approve, False to reject
            reviewer_user_id: Admin user ID who performed the review
            review_notes: Optional notes about the review decision

        Returns:
            Updated task instance or None if task not found

        Raises:
            ValueError: If task is not in PENDING_APPROVAL status
        """
        task = await self._repo.get_by_id(task_id)
        if not task:
            return None

        if task.status != TaskStatus.PENDING_APPROVAL:
            raise ValueError(f"Task {task_id} is not in PENDING_APPROVAL status")

        now = datetime.now()

        if approved:
            await self._repo.update_status(task_id, TaskStatus.PENDING, reviewed_at=now)
            self._logger.info("Approved task {} for execution", task_id)
        else:
            await self._repo.update_status(
                task_id,
                TaskStatus.CANCELLED,
                error_message=review_notes or "Rejected by admin",
                reviewed_at=now,
                completed_at=now,
                clear_pinned=True,
            )
            self._logger.info("Rejected task {}", task_id)

        return await self._repo.get_by_id(task_id)

    async def list_tasks(
        self,
        status: Optional[TaskStatus] = None,
        limit: int = 100,
        offset: int = 0,
        skip: int | None = None,
        since: Optional[datetime] = None,
        creator_user_id: Optional[int] = None,
        search: Optional[str] = None,
        exclude_repo_items: bool = False,
    ) -> tuple[int, List[Task]]:
        """List tasks with optional filtering and pagination.

        Args:
            status: Filter by status
            limit: Maximum results
            offset: Skip offset (deprecated, use skip instead)
            skip: Number of records to skip (pagination)
            since: Filter tasks created after this datetime
            creator_user_id: Filter by creator user ID
            search: Search term for repo_id (case-insensitive partial match)
            exclude_repo_items: If True, skip loading repo_items JSONB column

        Returns:
            Tuple of (total_count, tasks_list)
        """
        # Use skip if provided, otherwise fall back to offset
        offset_val = skip if skip is not None else offset

        return await self._repo.list_tasks(
            status=status,
            limit=limit,
            offset=offset_val,
            since=since,
            creator_user_id=creator_user_id,
            search=search,
            exclude_repo_items=exclude_repo_items,
        )

    async def list_active_tasks(
        self,
        exclude_repo_items: bool = True,
    ) -> List[Task]:
        """List active tasks only (running/pending/pending_approval/canceling).

        Optimized for high-frequency polling endpoints.

        Args:
            exclude_repo_items: If True, skip loading repo_items JSONB column

        Returns:
            List of active tasks
        """
        return await self._repo.list_active_tasks(
            exclude_repo_items=exclude_repo_items,
        )

    async def increment_retry_count(self, task_id: int) -> int:
        """Increment retry_count and return the new value."""
        return await self._repo.increment_retry_count(task_id)

    async def requeue_task(self, task_id: int) -> None:
        """Reset task to PENDING status for retry."""
        await self._repo.requeue_task(task_id)

    async def recover_orphaned_running_tasks(self) -> int:
        """Reset orphaned RUNNING/PAUSING tasks to PENDING at worker startup."""
        return await self._repo.reset_orphaned_running_tasks()

    async def get_tasks_with_status(
        self, task_ids: list[int], statuses: list[TaskStatus]
    ) -> list[tuple[int, TaskStatus]]:
        """Batch query: return (id, status) for tasks matching given statuses."""
        return await self._repo.get_tasks_with_status(task_ids, statuses)

    async def has_running_task(self, repo_id: str, repo_type: str) -> bool:
        """Check if a repo has a RUNNING task.

        Used at worker startup to decide whether an UPDATING profile
        should be recovered or left for the active worker.
        """
        return await self._repo.has_running_task(repo_id, repo_type)

    async def has_active_download_task(self, repo_id: str) -> bool:
        """Check if repository has an active download task.

        Args:
            repo_id: Repository ID

        Returns:
            True if there is an active download task
        """
        return await self._repo.has_active_download_task(repo_id)

    async def get_active_download_task(self, repo_id: str, source: str) -> Task | None:
        """Get active download task for a specific repo_id and source.

        Args:
            repo_id: Repository ID
            source: Repository source ('huggingface' or 'modelscope')

        Returns:
            Active task if exists, None otherwise
        """
        return await self._repo.get_active_download_task(repo_id, source)

    async def pin_task(self, task_id: int) -> Task | None:
        """Pin a pending task to give it higher priority.

        Args:
            task_id: Task ID to pin

        Returns:
            Updated task instance or None if task not found

        Raises:
            ValueError: If task is not in PENDING status
        """
        task = await self._repo.get_by_id(task_id)
        if not task:
            return None

        if task.status != TaskStatus.PENDING:
            raise ValueError(f"Task {task_id} is not in PENDING status")

        await self._repo.set_pinned(task_id, True)
        self._logger.info("Pinned task {}", task_id)

        return await self._repo.get_by_id(task_id)

    async def unpin_task(self, task_id: int) -> Task | None:
        """Unpin a pinned task.

        Args:
            task_id: Task ID to unpin

        Returns:
            Updated task instance or None if task not found

        Raises:
            ValueError: If task is not in PENDING status
        """
        task = await self._repo.get_by_id(task_id)
        if not task:
            return None

        if task.status != TaskStatus.PENDING:
            raise ValueError(f"Task {task_id} is not in PENDING status")

        await self._repo.set_pinned(task_id, False)
        self._logger.info("Unpinned task {}", task_id)

        return await self._repo.get_by_id(task_id)
