"""Unit tests for ``tree_item_to_ms_entry``.

Pure unit tests - no DB. Manually instantiate the ORM model (it is a plain
SQLAlchemy declarative class; constructing it without a session works for
attribute access on already-set fields).
"""

import uuid

from database.db_models import MsRepoTreeItem, TreeItemType
from ms_server.utils.response_builder import tree_item_to_ms_entry


def _make_item(
    *,
    path: str = "config.json",
    item_type: TreeItemType = TreeItemType.FILE,
    size: int = 730,
    oid: str | None = "deadbeef",
    lfs_oid: str | None = None,
) -> MsRepoTreeItem:
    return MsRepoTreeItem(
        commit_hash=uuid.uuid4().hex,
        type=item_type,
        path=path,
        size=size,
        oid=oid,
        lfs_oid=lfs_oid,
    )


class TestTreeItemToMsEntry:
    def test_file_maps_to_blob(self):
        entry = tree_item_to_ms_entry(_make_item(item_type=TreeItemType.FILE))
        assert entry["Type"] == "blob"

    def test_directory_maps_to_tree(self):
        entry = tree_item_to_ms_entry(_make_item(item_type=TreeItemType.DIRECTORY))
        assert entry["Type"] == "tree"

    def test_path_and_size_propagated(self):
        entry = tree_item_to_ms_entry(
            _make_item(path="tokenizer/vocab.json", size=1024)
        )
        assert entry["Path"] == "tokenizer/vocab.json"
        assert entry["Size"] == 1024

    def test_sha256_from_lfs_oid(self):
        """LFS files expose ``lfs_oid`` as ``Sha256``."""
        entry = tree_item_to_ms_entry(_make_item(lfs_oid="lfs-hash-123"))
        assert entry["Sha256"] == "lfs-hash-123"

    def test_sha256_none_for_non_lfs(self):
        """Non-LFS files have no content hash -> ``Sha256`` is None."""
        entry = tree_item_to_ms_entry(_make_item(lfs_oid=None))
        assert entry["Sha256"] is None

    def test_blob_id_uses_lfs_oid_when_present(self):
        entry = tree_item_to_ms_entry(
            _make_item(oid="plain-oid", lfs_oid="lfs-oid")
        )
        assert entry["BlobId"] == "lfs-oid"

    def test_blob_id_falls_back_to_oid(self):
        """Non-LFS files use ``oid`` as ``BlobId``."""
        entry = tree_item_to_ms_entry(_make_item(oid="plain-oid", lfs_oid=None))
        assert entry["BlobId"] == "plain-oid"

    def test_blob_id_none_when_both_empty(self):
        entry = tree_item_to_ms_entry(_make_item(oid=None, lfs_oid=None))
        assert entry["BlobId"] is None

    def test_pascalcase_keys(self):
        """All response keys are PascalCase per the ModelScope contract."""
        entry = tree_item_to_ms_entry(_make_item())
        assert set(entry.keys()) == {"Path", "Type", "Size", "Sha256", "BlobId"}
