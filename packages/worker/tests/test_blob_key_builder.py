"""Test BlobKeyBuilder injection seam (Phase 3.6).

Verifies that HF and MS blob key builders produce the correct S3 key
prefixes. HF must be unchanged from the original direct build_blob_key
call; MS must use the ms/ prefix.
"""

from storage import build_blob_key, build_ms_blob_key


def test_hf_blob_key_builder():
    """HF builder produces hf/ prefixed keys (behavior unchanged)."""

    def builder(repo_id, repo_type, blob_id):
        return build_blob_key(repo_id, repo_type, blob_id)

    key = builder("org/repo", "model", "abc123")
    assert key == "hf/model--org--repo/blobs/abc123"


def test_ms_blob_key_builder():
    """MS builder produces ms/ prefixed keys."""

    def builder(repo_id, repo_type, blob_id):
        return build_ms_blob_key(repo_id, repo_type, blob_id)

    key = builder("org/repo", "model", "abc123")
    assert key == "ms/model--org--repo/blobs/abc123"


def test_hf_and_ms_keys_differ_only_in_prefix():
    """Same repo_id/repo_type/blob_id -> keys differ only in hf/ vs ms/ prefix."""
    repo_id, repo_type, blob_id = "Qwen/Qwen3-0.6B", "model", "deadbeef"
    hf_key = build_blob_key(repo_id, repo_type, blob_id)
    ms_key = build_ms_blob_key(repo_id, repo_type, blob_id)
    assert hf_key.startswith("hf/")
    assert ms_key.startswith("ms/")
    # remainder identical
    assert hf_key[3:] == ms_key[3:]
