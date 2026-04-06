from datetime import datetime

from sqlalchemy import String, Enum, Index
from sqlalchemy.orm import Mapped, mapped_column

from database.db_models.base import Base
from database.db_models.enums import SnapshotStatus


class HfRepoSnapshot(Base):
    """Repository snapshot (commit) information.

    A revision (e.g., 'main') can only have one ACTIVE snapshot at a time.
    Previous commits are kept as ARCHIVED for metadata but their files may be deleted.
    """

    __tablename__ = "hf_repo_snapshots"
    __table_args__ = (
        # Core query: get active snapshot for a revision (used by HF API and worker)
        Index(
            "idx_snapshot_repo_type_rev_status",
            "repo_id",
            "repo_type",
            "revision",
            "status",
        ),
        # Exact lookup: find snapshot by specific commit hash
        Index(
            "idx_snapshot_repo_type_rev_commit",
            "repo_id",
            "repo_type",
            "revision",
            "commit_hash",
        ),
        # Query by commit hash (for direct commit access and tree queries)
        Index(
            "idx_snapshot_repo_commit",
            "repo_id",
            "commit_hash",
        ),
        # Admin: get all snapshots for a repository
        Index(
            "idx_snapshot_repo_id",
            "repo_id",
        ),
        {"schema": "mini_hf"},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    repo_id: Mapped[str] = mapped_column(String(255), nullable=False)
    repo_type: Mapped[str] = mapped_column(String(16), nullable=False)  # model/dataset
    revision: Mapped[str] = mapped_column(String(64), nullable=False)
    commit_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    committed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    status: Mapped[SnapshotStatus] = mapped_column(
        Enum(SnapshotStatus, native_enum=False),
        default=SnapshotStatus.INACTIVE,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now())
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(),
        onupdate=lambda: datetime.now(),
        nullable=False,
    )
