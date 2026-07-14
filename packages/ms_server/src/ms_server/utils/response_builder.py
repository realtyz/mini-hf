"""Response builders for ModelScope Legacy API.

Maps ORM tree items to the PascalCase ``Data.Files`` entry contract that the
``modelscope_hub`` client expects (analysis doc §2.2/§2.3).
"""

from database.db_models import MsRepoTreeItem, TreeItemType


def tree_item_to_ms_entry(item: MsRepoTreeItem) -> dict:
    """Convert a MsRepoTreeItem to a ModelScope file-tree entry dict.

    Field contract (PascalCase):
    - ``Path``: file path relative to repo root
    - ``Type``: ``"blob"`` for files, ``"tree"`` for directories (the DB
      enum uses ``"file"``/``"directory"`` and is mapped here)
    - ``Size``: file size in bytes (0 for directories)
    - ``Sha256``: LFS content hash (``lfs_oid``) if present, else ``None``
    - ``BlobId``: ``lfs_oid`` for LFS files, otherwise ``oid`` (matches the
      blob_id derivation used by the download endpoint and worker)
    """
    return {
        "Path": item.path,
        "Type": "blob" if item.type == TreeItemType.FILE else "tree",
        "Size": item.size,
        "Sha256": item.lfs_oid,
        "BlobId": item.lfs_oid or item.oid,
    }
