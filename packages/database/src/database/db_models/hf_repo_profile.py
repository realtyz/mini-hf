from datetime import datetime

from sqlalchemy import String, Integer, Enum, Index
from sqlalchemy.orm import Mapped, mapped_column

from database.db_models.base import Base
from database.db_models.enums import RepoStatus


class HfRepoProfile(Base):
    """Repository snapshot (commit) information."""

    __tablename__ = "hf_repo_profiles"
    __table_args__ = (
        # 复合唯一索引：最高频查询 (repo_id + repo_type)
        Index(
            "idx_repo_profiles_repo_id_repo_type", "repo_id", "repo_type", unique=True
        ),
        # 单列索引：delete_repository 端点只使用 repo_id 查询
        Index("idx_repo_profiles_repo_id", "repo_id"),
        # 复合索引：状态过滤 + 时间排序（用于列表查询）
        Index("idx_repo_profiles_status_updated_at", "status", "cache_updated_at"),
        {"schema": "mini_hf"},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    repo_id: Mapped[str] = mapped_column(String(255), nullable=False)
    repo_type: Mapped[str] = mapped_column(String(16), nullable=False)  # model/dataset
    pipeline_tag: Mapped[str] = mapped_column(String(255), nullable=True)
    cached_commits: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    downloads: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    first_cached_at: Mapped[datetime | None] = mapped_column(
        nullable=True, default=None
    )
    cache_updated_at: Mapped[datetime | None] = mapped_column(
        nullable=True, default=None
    )
    last_downloaded_at: Mapped[datetime | None] = mapped_column(
        nullable=True, default=None
    )
    status: Mapped[RepoStatus] = mapped_column(
        Enum(RepoStatus, native_enum=False),  # 使用 VARCHAR 而非 PostgreSQL 原生枚举
        default=RepoStatus.UPDATING,
        nullable=False,
        index=True,
    )
