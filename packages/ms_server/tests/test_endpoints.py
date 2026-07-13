"""Integration tests for ms_server endpoints.

Hits the ASGI app via httpx (in-process), backed by a real PostgreSQL instance
seeded through the ``db_session`` fixture. The S3 client is monkeypatched for
download tests so no real S3 is required.

Async tests are decorated with ``@pytest.mark.asyncio`` because the repo does
not set ``asyncio_mode = auto``.
"""

import httpx
import pytest

from ms_server.main import app
from storage.client import s3_client
from storage.utils.key_builder import build_ms_blob_key

REPO_NOT_FOUND_DETAIL = "repository or snapshot not found"


@pytest.fixture
def app_url() -> str:
    """Base URL for httpx ASGI transport; value is arbitrary for in-process calls."""
    return "http://testserver"


@pytest.mark.asyncio
async def test_model_files_returns_pascalcase_envelope(seeded_model_repo, app_url):
    repo_id, _commit = seeded_model_repo
    ns, name = repo_id.split("/")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=app_url
    ) as client:
        resp = await client.get(
            f"/api/v1/models/{ns}/{name}/repo/files",
            params={"Revision": "master", "Recursive": "True"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["Code"] == 200
    assert body["Message"] == "success"
    files = body["Data"]["Files"]
    paths = {f["Path"] for f in files}
    assert "config.json" in paths
    assert "tokenizer/vocab.json" in paths
    assert "tokenizer" in paths
    # Type mapping: file -> blob, directory -> tree
    by_path = {f["Path"]: f for f in files}
    assert by_path["config.json"]["Type"] == "blob"
    assert by_path["tokenizer"]["Type"] == "tree"


@pytest.mark.asyncio
async def test_model_files_with_root_filter(seeded_model_repo, app_url):
    repo_id, _commit = seeded_model_repo
    ns, name = repo_id.split("/")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=app_url
    ) as client:
        resp = await client.get(
            f"/api/v1/models/{ns}/{name}/repo/files",
            params={"Revision": "master", "Root": "tokenizer"},
        )
    assert resp.status_code == 200
    files = resp.json()["Data"]["Files"]
    paths = {f["Path"] for f in files}
    # only tokenizer/ subtree (and the tokenizer dir itself)
    assert paths == {"tokenizer", "tokenizer/vocab.json"}


@pytest.mark.asyncio
async def test_model_files_404_missing_repo(app_url):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=app_url
    ) as client:
        resp = await client.get(
            "/api/v1/models/nonexistent/repo/repo/files",
            params={"Revision": "master"},
        )
    assert resp.status_code == 404
    assert resp.json()["detail"] == REPO_NOT_FOUND_DETAIL


@pytest.mark.asyncio
async def test_dataset_tree_pagination_terminates_on_short_page(
    seeded_dataset_repo, app_url
):
    repo_id, _commit = seeded_dataset_repo
    ns, name = repo_id.split("/")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=app_url
    ) as client:
        page1 = await client.get(
            f"/api/v1/datasets/{ns}/{name}/repo/tree",
            params={"Revision": "master", "PageNumber": 1, "PageSize": 2},
        )
        page2 = await client.get(
            f"/api/v1/datasets/{ns}/{name}/repo/tree",
            params={"Revision": "master", "PageNumber": 2, "PageSize": 2},
        )
    assert page1.status_code == 200
    assert page2.status_code == 200
    files1 = page1.json()["Data"]["Files"]
    files2 = page2.json()["Data"]["Files"]
    # 3 total / PageSize 2 -> page1=2, page2=1 (short -> terminates)
    assert len(files1) == 2
    assert len(files2) == 1


@pytest.mark.asyncio
async def test_dataset_tree_pagination_extra_empty_page(
    seeded_dataset_repo, app_url
):
    """2 files / PageSize 2 -> page1 full (2), page2 empty (0) -> SDK terminates."""
    repo_id, _commit = seeded_dataset_repo
    ns, name = repo_id.split("/")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=app_url
    ) as client:
        # Use only the first 2 files by limiting with Root on a subdir would be
        # fragile; instead delete one and re-seed is heavy. Simpler: ask for a
        # PageSize that leaves exactly a full first page then empty page.
        # 3 files / PageSize 3 -> page1=3 (full), page2=0 (empty).
        page1 = await client.get(
            f"/api/v1/datasets/{ns}/{name}/repo/tree",
            params={"Revision": "master", "PageNumber": 1, "PageSize": 3},
        )
        page2 = await client.get(
            f"/api/v1/datasets/{ns}/{name}/repo/tree",
            params={"Revision": "master", "PageNumber": 2, "PageSize": 3},
        )
    files1 = page1.json()["Data"]["Files"]
    files2 = page2.json()["Data"]["Files"]
    assert len(files1) == 3  # full page
    assert len(files2) == 0  # empty page -> SDK stops
    # Response must not include Total (SDK ignores it, contract says omit)
    assert "Total" not in page1.json()["Data"]


@pytest.mark.asyncio
async def test_revision_resolution_commit_hash(seeded_model_repo, app_url):
    repo_id, commit_hash = seeded_model_repo
    ns, name = repo_id.split("/")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=app_url
    ) as client:
        resp = await client.get(
            f"/api/v1/models/{ns}/{name}/repo/files",
            params={"Revision": commit_hash},
        )
    assert resp.status_code == 200
    assert len(resp.json()["Data"]["Files"]) == 3


@pytest.mark.asyncio
async def test_revision_resolution_branch_name(seeded_model_repo, app_url):
    repo_id, _commit = seeded_model_repo
    ns, name = repo_id.split("/")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=app_url
    ) as client:
        resp = await client.get(
            f"/api/v1/models/{ns}/{name}/repo/files",
            params={"Revision": "master"},
        )
    assert resp.status_code == 200
    assert len(resp.json()["Data"]["Files"]) == 3


@pytest.mark.asyncio
async def test_dataset_root_pagination_memory_slice(
    seeded_dataset_repo, app_url
):
    """Root filter + in-memory pagination path: Root narrows then slices."""
    repo_id, _commit = seeded_dataset_repo
    ns, name = repo_id.split("/")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=app_url
    ) as client:
        page1 = await client.get(
            f"/api/v1/datasets/{ns}/{name}/repo/tree",
            params={
                "Revision": "master",
                "Root": "data",
                "PageNumber": 1,
                "PageSize": 2,
            },
        )
        page2 = await client.get(
            f"/api/v1/datasets/{ns}/{name}/repo/tree",
            params={
                "Revision": "master",
                "Root": "data",
                "PageNumber": 2,
                "PageSize": 2,
            },
        )
    files1 = page1.json()["Data"]["Files"]
    files2 = page2.json()["Data"]["Files"]
    # All 3 dataset files live under data/ -> 2 on page1, 1 on page2
    assert len(files1) == 2
    assert len(files2) == 1
    assert all(f["Path"].startswith("data/") for f in files1)
    assert all(f["Path"].startswith("data/") for f in files2)


@pytest.mark.asyncio
async def test_file_download_302_to_s3(
    seeded_model_repo, app_url, monkeypatch
):
    repo_id, _commit = seeded_model_repo
    ns, name = repo_id.split("/")
    target_path = "config.json"
    # Find the seeded oid for config.json to compute the expected key
    # (seeded fixture uses a random oid; we can't read it back here, so we
    # just assert the redirect goes somewhere and the key follows the MS format).

    captured_key: dict[str, str] = {}

    async def fake_get_file_metadata(key: str) -> dict | None:
        captured_key["key"] = key
        return {"key": key, "size": 730, "etag": "etag-1"}

    async def fake_presigned_url(key: str, **kwargs) -> str:
        return f"http://s3.local/{key}"

    monkeypatch.setattr(s3_client, "get_file_metadata", fake_get_file_metadata)
    monkeypatch.setattr(s3_client, "create_presigned_url", fake_presigned_url)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=app_url
    ) as client:
        resp = await client.get(
            f"/api/v1/models/{ns}/{name}/repo",
            params={"Revision": "master", "FilePath": target_path},
            follow_redirects=False,
        )
    assert resp.status_code == 302
    location = resp.headers["location"]
    assert location.startswith("http://s3.local/ms/")
    # The key must use the MS builder (ms/ prefix, not hf/)
    assert build_ms_blob_key(repo_id, "model", captured_key["key"].split("/")[-1]) == captured_key["key"]


@pytest.mark.asyncio
async def test_file_download_404_missing_snapshot(app_url):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=app_url
    ) as client:
        resp = await client.get(
            "/api/v1/models/nonexistent/repo/repo",
            params={"Revision": "master", "FilePath": "config.json"},
            follow_redirects=False,
        )
    assert resp.status_code == 404
    assert resp.json()["detail"] == REPO_NOT_FOUND_DETAIL


@pytest.mark.asyncio
async def test_file_download_404_missing_file(seeded_model_repo, app_url):
    repo_id, _commit = seeded_model_repo
    ns, name = repo_id.split("/")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=app_url
    ) as client:
        resp = await client.get(
            f"/api/v1/models/{ns}/{name}/repo",
            params={"Revision": "master", "FilePath": "does-not-exist.bin"},
            follow_redirects=False,
        )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "file not found"


@pytest.mark.asyncio
async def test_file_download_dataset_302(
    seeded_dataset_repo, app_url, monkeypatch
):
    """Dataset download path resolves repo_type=dataset via the /datasets/ prefix."""
    repo_id, _commit = seeded_dataset_repo
    ns, name = repo_id.split("/")

    async def fake_get_file_metadata(key: str) -> dict | None:
        return {"key": key, "size": 1000, "etag": "etag-d"}

    async def fake_presigned_url(key: str, **kwargs) -> str:
        return f"http://s3.local/{key}"

    monkeypatch.setattr(s3_client, "get_file_metadata", fake_get_file_metadata)
    monkeypatch.setattr(s3_client, "create_presigned_url", fake_presigned_url)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=app_url
    ) as client:
        resp = await client.get(
            f"/api/v1/datasets/{ns}/{name}/repo",
            params={"Revision": "master", "FilePath": "data/file-0.parquet"},
            follow_redirects=False,
        )
    assert resp.status_code == 302
    assert resp.headers["location"].startswith("http://s3.local/ms/dataset--")


@pytest.mark.asyncio
async def test_file_download_path_traversal_400(seeded_model_repo, app_url):
    repo_id, _commit = seeded_model_repo
    ns, name = repo_id.split("/")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=app_url
    ) as client:
        resp = await client.get(
            f"/api/v1/models/{ns}/{name}/repo",
            params={"Revision": "master", "FilePath": "../etc/passwd"},
            follow_redirects=False,
        )
    assert resp.status_code == 400
    assert "'..' sequence not allowed" in resp.json()["detail"]
