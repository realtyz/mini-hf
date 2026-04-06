"""Task repository for database operations."""

from datetime import datetime
from typing import List, Optional

from sqlalchemy import case, select, update
from sqlalchemy.ext.asyncio import AsyncSession

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

    async def list_tasks(
        self,
        status: Optional[TaskStatus] = None,
        limit: int = 100,
        offset: int = 0,
        since: Optional[datetime] = None,
        creator_user_id: Optional[int] = None,
    ) -> List[Task]:
        
        stmt = select(Task)

        if status:
            stmt = stmt.where(Task.status == status)

        if since:
            stmt = stmt.where(Task.created_at >= since)

        if creator_user_id:
            stmt = stmt.where(Task.creator_user_id == creator_user_id)

        # 排序优先级：
        # 1. 置顶任务在最前面（后置顶的排前面）
        # 2. 待审批任务排在置顶任务后面
        # 3. 其他任务按审批时间倒序（后审批的排前面）
        stmt = (
            stmt.order_by(
                # 1. 置顶任务在最前面（后置顶的排前面）
                Task.pinned_at.desc().nulls_last(),
                # 2. 待审批任务排在置顶任务后面
                case((Task.status == TaskStatus.PENDING_APPROVAL, 0), else_=1).asc(),
                # 3. 其他任务按审批时间倒序（后审批的排前面）
                Task.reviewed_at.desc().nulls_last(),
            )
            .limit(limit)
            .offset(offset)
        )

        result = await self.session.execute(stmt)
        return list(result.scalars().all())

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
                    ]
                ),
                Task.source.in_(["huggingface", "modelscope"]),
            )
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def get_active_download_task(
        self, repo_id: str, source: str
    ) -> Task | None:
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
                    ]
                ),
            )
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

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
