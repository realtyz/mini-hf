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
