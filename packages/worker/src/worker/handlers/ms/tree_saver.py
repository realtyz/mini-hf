"""ModelScope repository tree saving operations."""

from datetime import datetime

from loguru import logger
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from database.db_models import (
    MsRepoSnapshot,
    MsRepoTreeItem,
    SnapshotStatus,
    TreeItemType,
)
from database.db_repositories import MsRepoSnapshotRepository, MsRepoTreeRepository
from worker.handlers.source_types import SourceFile, SourceFolder, SourceTreeItem

_TREE_BATCH_SIZE = 1000


async def save_repo_tree(
    session: AsyncSession,
    snapshot_repo: MsRepoSnapshotRepository,
    tree_repo: MsRepoTreeRepository,
    tree_items: list[SourceTreeItem],
    repo_id: str,
    repo_type: str,
    revision: str,
    commit_hash: str,
    committed_at: datetime | None,
) -> bool:
    """Save repo tree to database.

    Creates new snapshot and tree items in the session.
    The caller is responsible for committing the session.

    Args:
        session: Database session for the transaction
        snapshot_repo: Snapshot repository instance
        tree_repo: Tree repository instance
        tree_items: List of SourceTreeItem objects
        repo_id: Repository ID
        repo_type: Repository type
        revision: Git revision
        commit_hash: Commit hash
        committed_at: Commit timestamp

    Returns:
        True if a new snapshot was created, False if it already existed
    """
    if not commit_hash:
        logger.warning("  -> No commit hash, skipping repo tree save")
        return False

    # Check if snapshot already exists for this revision and commit_hash
    existing_snapshot = await snapshot_repo.get_snapshot_by_repo(
        repo_id=repo_id,
        repo_type=repo_type,
        revision=revision,
        commit_hash=commit_hash,
    )

    if existing_snapshot:
        logger.info(
            "  -> Repo tree already exists for {}@{}, skipping",
            repo_id,
            commit_hash,
        )
        return False

    if committed_at is not None and committed_at.tzinfo is not None:
        committed_at = committed_at.replace(tzinfo=None)

    # Create snapshot (INACTIVE status initially)
    snapshot = MsRepoSnapshot(
        repo_id=repo_id,
        repo_type=repo_type,
        revision=revision,
        commit_hash=commit_hash,
        committed_at=committed_at,
        status=SnapshotStatus.INACTIVE,
    )
    session.add(snapshot)

    # Convert to database items
    items = []
    for item in tree_items:
        if isinstance(item, SourceFile):
            item_data: dict = {
                "path": item.path,
                "item_type": "file",
                "size": item.size,
                "oid": item.blob_id,
            }
            if item.lfs_sha256 is not None:
                item_data["lfs_oid"] = item.lfs_sha256
                item_data["lfs_size"] = item.lfs_size
                item_data["lfs_pointer_size"] = item.lfs_pointer_size
            items.append(item_data)
        elif isinstance(item, SourceFolder):
            items.append(
                {
                    "path": item.path,
                    "item_type": "directory",
                    "size": 0,
                    "oid": item.tree_id,
                }
            )

    # Batch insert tree items directly using shared session (atomic transaction)
    chunk_size = _TREE_BATCH_SIZE
    total_inserted = 0

    for i in range(0, len(items), chunk_size):
        chunk = items[i : i + chunk_size]

        # Build values for bulk insert
        values = []
        for item in chunk:
            item_type = TreeItemType(item["item_type"])
            # Set is_cached default by type: directory=None, file=False
            is_cached = None if item_type == TreeItemType.DIRECTORY else False

            value = {
                "commit_hash": commit_hash,
                "type": item_type,
                "path": item["path"],
                "size": item.get("size", 0),
                "oid": item.get("oid"),
                "is_cached": is_cached,
                "lfs_oid": item.get("lfs_oid"),
                "lfs_size": item.get("lfs_size"),
                "lfs_pointer_size": item.get("lfs_pointer_size"),
            }
            values.append(value)

        # Use INSERT ... ON CONFLICT DO NOTHING for upsert
        stmt = insert(MsRepoTreeItem).values(values)
        stmt = stmt.on_conflict_do_nothing(
            constraint="uq_ms_repo_tree_items_commit_path"
        )
        result = await session.execute(stmt)
        total_inserted += result.rowcount  # type: ignore[attr-defined]

    # Note: session commit is the caller's responsibility
    files_count = sum(1 for item in items if item["item_type"] == "file")
    folders_count = sum(1 for item in items if item["item_type"] == "directory")
    logger.info(
        "  -> Saved repo tree: {}@{} - {} files, {} directories",
        repo_id,
        commit_hash,
        files_count,
        folders_count,
    )

    return True
