from sqlalchemy import BigInteger, Boolean, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from database.db_models.base import Base
from database.db_models.enums import TreeItemType


class HfRepoTreeItem(Base):
    """Repository tree item (file or folder).

    Stores the content of list_repo_tree() results.
    """

    __tablename__ = "hf_repo_tree_items"
    __table_args__ = (
        UniqueConstraint(
            "commit_hash",
            "path",
            name="uq_hf_repo_tree_items_commit_path",
        ),
        # 单字段索引：commit_hash
        Index(
            "idx_hf_repo_tree_items_commit_hash",
            "commit_hash",
        ),
        # 缓存统计查询优化：commit_hash + type + is_cached
        Index(
            "idx_hf_repo_tree_items_cached",
            "commit_hash",
            "type",
            "is_cached",
        ),
        # 游标分页和单文件查询优化：commit_hash + path
        Index(
            "idx_hf_repo_tree_items_commit_path",
            "commit_hash",
            "path",
        ),
        {"schema": "mini_hf"},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    oid: Mapped[str | None] = mapped_column(
        String(64), nullable=False, comment="blob_id for files, tree_id for folders"
    )

    commit_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # Item type: file or directory
    type: Mapped[TreeItemType] = mapped_column(String(16), nullable=False)

    # Path (relative to repo root)
    path: Mapped[str] = mapped_column(String(2048), nullable=False)

    # For files: file size in bytes
    size: Mapped[int] = mapped_column(BigInteger, nullable=False)

    lfs_oid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lfs_size: Mapped[int] = mapped_column(BigInteger, nullable=True)
    lfs_pointer_size: Mapped[int] = mapped_column(BigInteger, nullable=True)

    xet_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Cache status: null for directories, false for files (until cached), true when cached
    is_cached: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
