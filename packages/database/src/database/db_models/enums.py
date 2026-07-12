from enum import Enum as PyEnum


class RepoStatus(str, PyEnum):
    """Repository profile status enum."""

    ACTIVE = "active"  # 仓库正常可用
    INACTIVE = "inactive"  # 仓库不可用
    UPDATING = "updating"  # 仓库正在更新
    CLEANING = "cleaning"  # 仓库正在清理
    CLEANED = "cleaned"  # 仓库已清理（删除完成）


class SnapshotStatus(str, PyEnum):
    """Snapshot status enum.

    INACTIVE: Newly created snapshot, files not yet fully downloaded
    ACTIVE: Current commit for this revision (latest), files are complete
    ARCHIVED: Previously active commit, kept for metadata but files may be deleted
    """

    INACTIVE = "inactive"  # 新创建，文件未完全下载
    ACTIVE = "active"  # 当前 revision 指向的 commit，文件完整可用
    ARCHIVED = "archived"  # 曾经属于该 revision，现在被替代


class TreeItemType(str, PyEnum):
    """Type of tree item."""

    FILE = "file"
    DIRECTORY = "directory"


class TaskStatus(str, PyEnum):
    """Task status enum."""

    PENDING_APPROVAL = "pending_approval"  # 等待管理员审批
    PENDING = "pending"  # 排队下载
    RUNNING = "running"  # 执行中
    CANCELING = "canceling"  # 取消中
    CANCELLED = "cancelled"  # 已取消
    PAUSING = "pausing"  # 暂停中
    PAUSED = "paused"  # 已暂停
    COMPLETED = "completed"  # 已完成
    FAILED = "failed"  # 失败


class AnnouncementType(str, PyEnum):
    INFO = "info"
    WARNING = "warning"
    URGENT = "urgent"


class Source(str, PyEnum):
    """Task source identifier - determines which handler/table set is used.

    The DB column ``Task.source`` stays ``String(16)``; since ``Source`` is a
    ``str`` subclass, enum members read/write transparently as their string
    values without needing a migration.
    """

    HUGGINGFACE = "huggingface"
    MODELSCOPE = "modelscope"
