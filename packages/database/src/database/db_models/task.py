from datetime import datetime
from enum import Enum as PyEnum
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Enum, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from database.db_models.base import Base


class TaskStatus(str, PyEnum):
    """Task status enum."""

    PENDING_APPROVAL = "pending_approval"  # 等待管理员审批
    PENDING = "pending"  # 排队下载
    RUNNING = "running"  # 执行中
    CANCELING = "canceling"  # 取消中
    CANCELLED = "cancelled"  # 已取消
    COMPLETED = "completed"  # 已完成
    FAILED = "failed"  # 失败


class Task(Base):
    """Task model for queue-based task processing.

    Uses PostgreSQL FOR UPDATE SKIP LOCKED for concurrent task fetching.

    This model is shared between server (task creation) and worker (task processing).
    """

    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_task_worker_fetch", "status", "reviewed_at", "pinned_at"),
        Index("ix_task_repo_active", "repo_id", "source", "status"),
        Index("ix_task_source", "source"),
        Index("ix_task_repo_id", "repo_id"),
        Index("ix_task_status", "status"),
        Index("ix_task_created_at", "created_at"),
        Index("ix_task_creator_user_id", "creator_user_id"),
        Index("ix_task_list_user", "creator_user_id", "status", "created_at"),
        Index("ix_task_list_status_created", "status", "created_at"),
        {"schema": "mini_hf"},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # 仓库来源，'huggingface' or 'modelscope'
    repo_type: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # 仓库类型，'model' or 'dataset'
    revision: Mapped[str] = mapped_column(String(64), nullable=False)
    repo_id: Mapped[str] = mapped_column(String(255), nullable=False)
    hf_endpoint: Mapped[str] = mapped_column(String(64), nullable=True)

    repo_items: Mapped[Optional[list]] = mapped_column(
        JSONB, default=list, nullable=True, comment="仓库文件项目详细列表"
    )
    commit_hash: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, comment="代码提交哈希"
    )

    access_token: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )  # 某些仓库可能需要认证
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, native_enum=False),  # 使用 VARCHAR 而非 PostgreSQL 原生枚举
        default=TaskStatus.PENDING_APPROVAL,
        nullable=False,
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Priority
    pinned_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True, comment="置顶时间"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        default=lambda: datetime.now(),
        nullable=False,
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        default=lambda: datetime.now(),
        onupdate=lambda: datetime.now(),
        nullable=False,
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True
    )

    # 仓库统计信息
    total_file_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, comment="仓库总文件数量"
    )
    required_file_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="需要下载的文件数量（考虑过滤规则后）",
    )
    total_storage: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, comment="仓库总存储大小（字节）"
    )
    required_storage: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, comment="需要下载的存储大小（字节）"
    )
    downloaded_file_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, comment="实际下载完成的文件数量"
    )
    downloaded_bytes: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, comment="实际下载完成的字节数"
    )

    creator_user_id: Mapped[int] = mapped_column(nullable=False)

    def __repr__(self) -> str:
        return f"<Task(id={self.id}, repo_id={self.repo_id}, status={self.status})>"
