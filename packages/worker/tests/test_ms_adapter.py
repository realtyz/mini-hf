"""Test ModelScope adapter conversions (Phase 3.1).

Verifies dict -> SourceFile / SourceFolder / SourceTreeItem conversion,
mirroring the HF adapter tests but operating on raw ModelScope file tree
dicts (as returned by ModelScopeService.resolve_commit).
"""

from worker.handlers.ms.adapter import (
    convert_cached_tree,
    convert_ms_file_entry,
    convert_ms_folder_entry,
    convert_ms_tree_entries,
)


class TestConvertMsFileEntry:
    def test_lfs_file_with_sha256(self):
        """LFS file: Sha256 present -> used as blob_id (content-addressed)."""
        entry = {
            "Path": "model.bin",
            "Type": "blob",
            "Size": 999,
            "Sha256": "abc123sha256",
            "BlobId": None,
            "Revision": "6d077077",
        }
        sf = convert_ms_file_entry(entry)
        assert sf.path == "model.bin"
        assert sf.size == 999
        assert sf.blob_id == "abc123sha256"  # prefer Sha256
        assert sf.lfs_sha256 == "abc123sha256"
        assert sf.lfs_size == 999

    def test_regular_file_with_blob_id(self):
        """Regular file: no Sha256 -> fallback to BlobId."""
        entry = {
            "Path": "config.json",
            "Type": "blob",
            "Size": 100,
            "Sha256": None,
            "BlobId": "blob-id-xyz",
            "Revision": "abc123",
        }
        sf = convert_ms_file_entry(entry)
        assert sf.blob_id == "blob-id-xyz"  # fallback to BlobId
        assert sf.lfs_sha256 is None
        assert sf.lfs_size is None
        assert sf.lfs_pointer_size is None

    def test_sha256_takes_precedence_over_blob_id(self):
        """When both Sha256 and BlobId present, Sha256 wins (matches HF adapter)."""
        entry = {
            "Path": "weights.bin",
            "Type": "blob",
            "Size": 500,
            "Sha256": "sha-content-id",
            "BlobId": "blob-alt-id",
        }
        sf = convert_ms_file_entry(entry)
        assert sf.blob_id == "sha-content-id"
        assert sf.lfs_sha256 == "sha-content-id"

    def test_empty_entry(self):
        """Missing fields default to empty/zero values."""
        sf = convert_ms_file_entry({})
        assert sf.path == ""
        assert sf.size == 0
        assert sf.blob_id == ""
        assert sf.lfs_sha256 is None
        assert sf.lfs_size is None
        assert sf.lfs_pointer_size is None


class TestConvertMsFolderEntry:
    def test_folder_uses_revision_as_tree_id(self):
        entry = {"Path": "subdir", "Type": "tree", "Revision": "rev-abc"}
        sf = convert_ms_folder_entry(entry)
        assert sf.path == "subdir"
        assert sf.tree_id == "rev-abc"

    def test_folder_fallback_to_blob_id(self):
        """No Revision -> fallback to BlobId, then empty string."""
        entry = {"Path": "data", "Type": "tree", "BlobId": "bid-1"}
        sf = convert_ms_folder_entry(entry)
        assert sf.tree_id == "bid-1"

    def test_folder_empty_entry(self):
        sf = convert_ms_folder_entry({})
        assert sf.path == ""
        assert sf.tree_id == ""


class TestConvertMsTreeEntries:
    def test_mixed_entries(self):
        entries = [
            {"Path": "config.json", "Type": "blob", "Size": 100, "Sha256": "s1"},
            {"Path": "subdir", "Type": "tree", "Revision": "tree-id-1"},
            {"Path": "model.bin", "Type": "blob", "Size": 999, "BlobId": "b1"},
        ]
        items = convert_ms_tree_entries(entries)
        assert len(items) == 3
        assert items[0].path == "config.json"  # SourceFile
        assert items[1].path == "subdir"  # SourceFolder
        assert items[2].path == "model.bin"  # SourceFile

    def test_unknown_type_skipped(self):
        """Unknown Type values are skipped (not in output)."""
        entries = [
            {"Path": "f.txt", "Type": "blob", "Size": 1},
            {"Path": "weird", "Type": "commit"},
            {"Path": "Case", "Type": "Blob"},  # case-sensitive mismatch
        ]
        items = convert_ms_tree_entries(entries)
        assert len(items) == 1
        assert items[0].path == "f.txt"

    def test_empty_list(self):
        assert convert_ms_tree_entries([]) == []


class TestConvertCachedTree:
    """convert_cached_tree converts MsRepoTreeItem ORM -> CachedFileInfo.

    Uses lightweight stub objects to avoid DB dependency.
    """

    def test_convert_cached_tree_files(self):
        class _StubType:
            def __init__(self, v):
                self.value = v

        class _StubItem:
            def __init__(self, path, type_val, is_cached, oid, lfs_oid):
                self.path = path
                self.type = _StubType(type_val)
                self.is_cached = is_cached
                self.oid = oid
                self.lfs_oid = lfs_oid

        items = [
            _StubItem("config.json", "file", True, "blob-1", None),
            _StubItem("model.bin", "file", True, "sha-xxx", "sha-xxx"),
        ]
        result = convert_cached_tree(items)  # type: ignore[arg-type]
        assert len(result) == 2
        assert result[0].path == "config.json"
        assert result[0].oid == "blob-1"
        assert result[0].is_cached is True
        # lfs_oid takes precedence for oid when present
        assert result[1].oid == "sha-xxx"
        assert result[1].lfs_oid == "sha-xxx"
