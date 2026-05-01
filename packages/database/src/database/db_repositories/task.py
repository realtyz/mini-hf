"""Task repository for database operations."""

from datetime import datetime
from typing import List, Optional

from sqlalchemy import case, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from database.db_models import Task, TaskStatus


class TaskRepository:
    """Task repository for database operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(
        self,
        source: str,
        repo_id: str,
        repo_type: str,
        revision: str,
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
        """Create a new task with PENDING_APPROVAL status.

        Args:
            source: Repository source ('huggingface' or 'modelscope')
            repo_id: Repository ID to download
            repo_type: Repository type ('model' or 'dataset')
            revision: Repository revision/commit to download
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
        task = Task(
            source=source,
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
            hf_endpoint=hf_endpoint,
            access_token=access_token,
            creator_user_id=creator_user_id,
            status=TaskStatus.PENDING_APPROVAL,
            total_storage=total_storage,
            required_file_count=required_file_count,
            total_file_count=total_file_count,
            repo_items=repo_items or [],
            commit_hash=commit_hash,
            required_storage=required_storage,
        )
        self.session.add(task)
        await self.session.flush()
        await self.session.refresh(task)
        return task

    async def get_by_id(self, task_id: int) -> Optional[Task]:
        """Get task by ID.

        Args:
            task_id: Task ID

        Returns:
            Task instance or None
        """
        return await self.session.get(Task, task_id)

    async def get_next_for_worker(self, batch_size: int = 1) -> List[Task]:
        """Fetch pending tasks using FOR UPDATE SKIP LOCKED.

        This method safely fetches tasks concurrently from multiple workers
        using PostgreSQL's SKIP LOCKED clause.

        Args:
            batch_size: Number of tasks to fetch

        Returns:
            List of tasks with status updated to RUNNING
        """
        # Step 1: Select and lock pending tasks using SKIP LOCKED
        # Order by: pinned tasks first (LIFO), then by reviewed_at (FIFO)
        stmt = (
            select(Task)
            .where(Task.status == TaskStatus.PENDING, Task.reviewed_at.isnot(None))
            .order_by(Task.pinned_at.desc().nulls_last(), Task.reviewed_at.asc())
            .limit(batch_size)
            .with_for_update(skip_locked=True)
        )

        result = await self.session.execute(stmt)
        tasks = list(result.scalars().all())

        if not tasks:
            return []

        # Step 2: Update selected tasks to RUNNING status
        task_ids = [t.id for t in tasks]
        now = datetime.now()

        await self.session.execute(
            update(Task)
            .where(Task.id.in_(task_ids))
            .values(
                status=TaskStatus.RUNNING,
                started_at=now,
                updated_at=now,
            )
        )
        await self.session.flush()

        # Refresh all tasks in a single query
        result = await self.session.execute(select(Task).where(Task.id.in_(task_ids)))
        return list(result.scalars().all())

    async def update_status(
        self,
        task_id: int,
        status: TaskStatus,
        *,
        error_message: str | None = None,
        started_at: datetime | None = None,
        completed_at: datetime | None = None,
        reviewed_at: datetime | None = None,
        clear_pinned: bool = False,
    ) -> None:
        """Update task status and related timestamps.

        Args:
            task_id: Task ID
            status: New status
            error_message: Optional error message
            started_at: Optional started timestamp
            completed_at: Optional completed timestamp
            reviewed_at: Optional reviewed timestamp
            clear_pinned: Whether to clear pinned_at
        """
        now = datetime.now()
        values = {
            "status": status,
            "updated_at": now,
        }

        if error_message is not None:
            values["error_message"] = error_message[:2000] if error_message else None
        if started_at is not None:
            values["started_at"] = started_at
        if completed_at is not None:
            values["completed_at"] = completed_at
        if reviewed_at is not None:
            values["reviewed_at"] = reviewed_at
        if clear_pinned:
            values["pinned_at"] = None

        await self.session.execute(
            update(Task).where(Task.id == task_id).values(**values)
        )
        await self.session.flush()

    async def list_tasks(
        self,
        status: Optional[TaskStatus] = None,
        limit: int = 100,
        offset: int = 0,
        since: Optional[datetime] = None,
        creator_user_id: Optional[int] = None,
        search: Optional[str] = None,
        exclude_repo_items: bool = False,
    ) -> tuple[int, List[Task]]:
        """List tasks with optional filtering and pagination.

        Args:
            status: Filter by task status
            limit: Maximum results
            offset: Number of records to skip (pagination)
            since: Filter tasks created after this datetime
            creator_user_id: Filter by creator user ID
            search: Search term for repo_id (case-insensitive partial match)
            exclude_repo_items: If True, skip loading the repo_items JSONB column
                to reduce database transfer overhead for list endpoints.

        Returns:
            Tuple of (total_count, tasks_list)
        """

        # Build base query — optionally defer the large repo_items column
        base_stmt = select(Task)
        if exclude_repo_items:
            base_stmt = base_stmt.options(defer(Task.repo_items))
        count_stmt = select(func.count()).select_from(Task)

        # Apply filters to both queries
        if status:
            base_stmt = base_stmt.where(Task.status == status)
            count_stmt = count_stmt.where(Task.status == status)

        if since:
            base_stmt = base_stmt.where(Task.created_at >= since)
            count_stmt = count_stmt.where(Task.created_at >= since)

        if creator_user_id:
            base_stmt = base_stmt.where(Task.creator_user_id == creator_user_id)
            count_stmt = count_stmt.where(Task.creator_user_id == creator_user_id)

        if search:
            base_stmt = base_stmt.where(Task.repo_id.ilike(f"%{search}%"))
            count_stmt = count_stmt.where(Task.repo_id.ilike(f"%{search}%"))

        # Get total count
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar_one()

        # 排序优先级：
        # 1. RUNNING状态在最前面（无论是否置顶）
        # 2. 置顶的非RUNNING任务（后置顶的排前面）
        # 3. 其他非RUNNING、非置顶任务
        # 4. 同分组内按状态优先级：PENDING_APPROVAL (0) → PENDING (1) → 其他 (2)
        # 5. 同状态下：
        #    - PENDING_APPROVAL/PENDING: 按 reviewed_at 升序
        #    - 其他状态: 按 completed_at 降序
        stmt = (
            base_stmt.order_by(
                # 1. RUNNING/PAUSING任务优先级为0，其他为1
                case(
                    (Task.status == TaskStatus.RUNNING, 0),
                    (Task.status == TaskStatus.PAUSING, 0),
                    else_=1,
                ).asc(),
                # 2. 置顶任务在非RUNNING任务中排前面
                case(
                    (Task.status == TaskStatus.RUNNING, 1),  # RUNNING任务忽略置顶
                    (Task.pinned_at.isnot(None), 0),  # 非RUNNING置顶任务
                    else_=1,  # 非置顶任务
                ).asc(),
                # 3. 置顶任务后置顶的排前面
                Task.pinned_at.desc().nulls_last(),
                # 4. 状态优先级分组（非RUNNING任务）
                case(
                    (Task.status == TaskStatus.RUNNING, 0),  # RUNNING任务忽略
                    (Task.status == TaskStatus.PAUSING, 0),
                    (Task.status == TaskStatus.PENDING_APPROVAL, 0),
                    (Task.status == TaskStatus.PENDING, 1),
                    (Task.status == TaskStatus.PAUSED, 2),
                    else_=3,
                ).asc(),
                # 5a. 对于 PENDING_APPROVAL/PENDING，按 reviewed_at 升序
                case(
                    (Task.status == TaskStatus.PENDING_APPROVAL, Task.reviewed_at),
                    (Task.status == TaskStatus.PENDING, Task.reviewed_at),
                    else_=None,
                )
                .asc()
                .nulls_last(),
                # 5b. 对于其他状态，按 completed_at 降序
                case(
                    (Task.status == TaskStatus.PENDING_APPROVAL, None),
                    (Task.status == TaskStatus.RUNNING, None),
                    (Task.status == TaskStatus.PENDING, None),
                    else_=Task.completed_at,
                )
                .desc()
                .nulls_last(),
            )
            .limit(limit)
            .offset(offset)
        )

        result = await self.session.execute(stmt)
        tasks = list(result.scalars().all())

        return total, tasks

    async def list_active_tasks(
        self,
        exclude_repo_items: bool = True,
    ) -> List[Task]:
        """List active tasks only (running/pending/pending_approval/canceling).

        Optimized for high-frequency polling:
        - No COUNT query (total is implicit from result length)
        - No time window filter (active tasks are inherently recent)
        - No pagination (typically <20 active tasks)
        - Simple ORDER BY (status priority + created_at)
        - Uses ix_task_list_status_created composite index

        Args:
            exclude_repo_items: If True, skip loading repo_items JSONB column

        Returns:
            List of active tasks, ordered by status priority
        """
        active_statuses = [
            TaskStatus.RUNNING,
            TaskStatus.PENDING,
            TaskStatus.PENDING_APPROVAL,
            TaskStatus.CANCELING,
        ]

        stmt = select(Task).where(Task.status.in_(active_statuses))

        if exclude_repo_items:
            stmt = stmt.options(defer(Task.repo_items))

        # Simple ordering: RUNNING first, then pinned, then by status priority and created_at
        stmt = stmt.order_by(
            # RUNNING tasks first
            case(
                (Task.status == TaskStatus.RUNNING, 0),
                else_=1,
            ).asc(),
            # Pinned tasks next
            Task.pinned_at.desc().nulls_last(),
            # Status priority: PENDING_APPROVAL > PENDING > CANCELING
            case(
                (Task.status == TaskStatus.PENDING_APPROVAL, 0),
                (Task.status == TaskStatus.PENDING, 1),
                else_=2,
            ).asc(),
            # Within same status, oldest first
            Task.created_at.asc(),
        )

        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_tasks_with_status(
        self, task_ids: list[int], statuses: list[TaskStatus]
    ) -> list[tuple[int, TaskStatus]]:
        """Batch query: return (id, status) for tasks matching given statuses.

        Used by the worker's single watch coroutine to find tasks that
        need cancel/pause signals without per-task queries.
        """
        if not task_ids:
            return []
        stmt = select(Task.id, Task.status).where(
            Task.id.in_(task_ids),
            Task.status.in_(statuses),
        )
        result = await self.session.execute(stmt)
        return [(row[0], row[1]) for row in result.all()]

    async def has_running_task(self, repo_id: str, repo_type: str) -> bool:
        """Check if a repo has a RUNNING task.

        Used at worker startup to decide whether an UPDATING profile
        should be recovered or left for the active worker.
        """
        stmt = (
            select(Task)
            .where(
                Task.repo_id == repo_id,
                Task.repo_type == repo_type,
                Task.status == TaskStatus.RUNNING,
            )
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def has_active_download_task(self, repo_id: str) -> bool:
        """Check if repository has an active download task.

        Args:
            repo_id: Repository ID

        Returns:
            True if there is a PENDING, PENDING_APPROVAL, or RUNNING download task
        """
        stmt = (
            select(Task)
            .where(
                Task.repo_id == repo_id,
                Task.status.in_(
                    [
                        TaskStatus.PENDING,
                        TaskStatus.PENDING_APPROVAL,
                        TaskStatus.RUNNING,
                        TaskStatus.PAUSED,
                    ]
                ),
                Task.source.in_(["huggingface", "modelscope"]),
            )
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def get_active_download_task(self, repo_id: str, source: str) -> Task | None:
        """Get active download task for a specific repo_id and source.

        Args:
            repo_id: Repository ID
            source: Repository source ('huggingface' or 'modelscope')

        Returns:
            Active task if exists, None otherwise
        """
        stmt = (
            select(Task)
            .where(
                Task.repo_id == repo_id,
                Task.source == source,
                Task.status.in_(
                    [
                        TaskStatus.PENDING,
                        TaskStatus.PENDING_APPROVAL,
                        TaskStatus.RUNNING,
                        TaskStatus.PAUSED,
                    ]
                ),
            )
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def increment_retry_count(self, task_id: int) -> int:
        """Increment retry_count and return the new value."""
        stmt = (
            update(Task)
            .where(Task.id == task_id)
            .values(retry_count=Task.retry_count + 1)
            .returning(Task.retry_count)
        )
        result = await self.session.execute(stmt)
        row = result.scalar_one_or_none()
        await self.session.flush()
        return row if row is not None else 0

    async def requeue_task(self, task_id: int) -> None:
        """Reset task to PENDING status for retry."""
        await self.session.execute(
            update(Task)
            .where(Task.id == task_id)
            .values(
                status=TaskStatus.PENDING,
                started_at=None,
                error_message=None,
            )
        )
        await self.session.flush()

    async def reset_orphaned_running_tasks(self) -> int:
        """Reset RUNNING and PAUSING tasks to PENDING at worker startup.

        Tasks left in RUNNING or PAUSING from a crashed worker are orphaned
        and must be requeued so a new worker picks them up.
        """
        result = await self.session.execute(
            update(Task)
            .where(Task.status.in_([TaskStatus.RUNNING, TaskStatus.PAUSING]))
            .values(
                status=TaskStatus.PENDING,
                started_at=None,
                error_message=None,
                updated_at=datetime.now(),
            )
        )
        await self.session.flush()
        return result.rowcount

    async def get_download_stats(self, task_id: int) -> tuple[int, int]:
        """Return (downloaded_file_count, downloaded_bytes) for a task.

        Used as DB fallback when Redis progress data is unavailable.
        """
        stmt = select(Task.downloaded_file_count, Task.downloaded_bytes).where(
            Task.id == task_id
        )
        result = await self.session.execute(stmt)
        row = result.one_or_none()
        if row is None:
            return 0, 0
        return row[0] or 0, row[1] or 0

    async def update_download_stats(
        self,
        task_id: int,
        downloaded_file_count: int,
        downloaded_bytes: int,
    ) -> None:
        """Update download progress stats for a task.

        Args:
            task_id: Task ID
            downloaded_file_count: Number of files downloaded
            downloaded_bytes: Total bytes downloaded
        """
        await self.session.execute(
            update(Task)
            .where(Task.id == task_id)
            .values(
                downloaded_file_count=downloaded_file_count,
                downloaded_bytes=downloaded_bytes,
            )
        )
        await self.session.flush()

    async def set_pinned(self, task_id: int, pinned: bool) -> None:
        """Set or clear pinned status for a task.

        Args:
            task_id: Task ID
            pinned: True to pin, False to unpin
        """
        now = datetime.now()
        await self.session.execute(
            update(Task)
            .where(Task.id == task_id)
            .values(
                pinned_at=now if pinned else None,
                updated_at=now,
            )
        )
        await self.session.flush()
