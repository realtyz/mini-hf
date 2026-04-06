"""Repository tree saving operations."""

from datetime import datetime

from huggingface_hub import RepoFile, RepoFolder
from loguru import logger
from sqlalchemy.dialects.postgresql import insert

from database.db_models import HfRepoSnapshot, HfRepoTreeItem, SnapshotStatus, TreeItemType
from database.db_repositories import HfRepoSnapshotRepository, HfRepoTreeRepository


async def save_repo_tree(
    snapshot_repo: HfRepoSnapshotRepository,
    tree_repo: HfRepoTreeRepository,
    tree_items: list[RepoFile | RepoFolder],
    repo_id: str,
    repo_type: str,
    revision: str,
    commit_hash: str,
    committed_at: datetime | None,
) -> bool:
    """Save repo tree to database atomically.

    Creates new snapshot and tree items in a single transaction.
    Both operations must succeed together, or both will be rolled back.

    Args:
        snapshot_repo: Snapshot repository instance
        tree_repo: Tree repository instance
        tree_items: List of RepoFile/RepoFolder objects
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

    # Get shared session for atomic transaction
    session = snapshot_repo._session

    # 处理带时区的 datetime - 转换为无时区（假设 UTC）
    if committed_at is not None and committed_at.tzinfo is not None:
        committed_at = committed_at.replace(tzinfo=None)

    # Create snapshot (INACTIVE status initially)
    snapshot = HfRepoSnapshot(
        repo_id=repo_id,
        repo_type=repo_type,
        revision=revision,
        commit_hash=commit_hash,
        committed_at=committed_at,
        status=SnapshotStatus.INACTIVE,
    )
    session.add(snapshot)
    # Note: Not committing here - will be committed with tree items together

    # Convert to database items
    items = []
    for item in tree_items:
        if isinstance(item, RepoFile):
            item_data = {
                "path": item.path,
                "item_type": "file",
                "size": item.size,
                "oid": item.blob_id,
            }
            # Save LFS fields if file has LFS info
            if item.lfs is not None:
                item_data["lfs_oid"] = item.lfs.sha256
                item_data["lfs_size"] = item.lfs.size
                item_data["lfs_pointer_size"] = item.lfs.pointer_size
            items.append(item_data)
        else:  # RepoFolder
            items.append(
                {
                    "path": item.path,
                    "item_type": "directory",
                    "size": 0,
                    "oid": item.tree_id,
                }
            )

    # Batch insert tree items directly using shared session (atomic transaction)
    chunk_size = 1000
    total_inserted = 0

    for i in range(0, len(items), chunk_size):
        chunk = items[i : i + chunk_size]

        # Build values for bulk insert
        values = []
        for item in chunk:
            item_type = TreeItemType(item["item_type"])
            # 根据类型设置 is_cached 默认值: directory=None, file=False
            is_cached = None if item_type == TreeItemType.DIRECTORY else False

            value = {
                "commit_hash": commit_hash,
                "type": item_type.value,
                "path": item["path"],
                "size": item.get("size", 0),
                "oid": item.get("oid"),
                "is_cached": is_cached,
                "lfs_oid": item.get("lfs_oid"),
                "lfs_size": item.get("lfs_size"),
                "lfs_pointer_size": item.get("lfs_pointer_size"),
                "xet_hash": item.get("xet_hash"),
            }
            values.append(value)

        # Use INSERT ... ON CONFLICT DO NOTHING for upsert
        stmt = insert(HfRepoTreeItem).values(values)
        stmt = stmt.on_conflict_do_nothing(
            constraint="uq_hf_repo_tree_items_commit_path"
        )
        result = await session.execute(stmt)
        total_inserted += result.rowcount  # type: ignore[attr-defined]

    # Note: We don't commit here - caller will commit the entire transaction
    # This ensures snapshot and tree items are saved atomically

    files_count = sum(1 for item in items if item["item_type"] == "file")
    folders_count = sum(1 for item in items if item["item_type"] == "directory")
    logger.info(
        "  -> Prepared repo tree: {}@{} - {} files, {} directories (pending commit)",
        repo_id,
        commit_hash,
        files_count,
        folders_count,
    )

    return True
