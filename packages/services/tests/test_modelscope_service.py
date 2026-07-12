"""Unit tests for ModelScopeService.

V1: build_file_url + build_auth_headers (pure functions).
V2: _extract_commit_hash (pure function).
V2b: _extract_data + _raise_for_status + pagination aggregation, using
     httpx.MockTransport (no network, no DB).

These tests do NOT touch the database -- they exercise the pure logic and
mock-transported HTTP paths of ModelScopeService.
"""

import httpx
import pytest

from services.modelscope import ModelScopeService
from modelscope_hub.errors import (
    AuthenticationError,
    InvalidParameter,
    NotExistError,
    PermissionDeniedError,
    RateLimitError,
    ServerError,
)


def _make_service_with_mock(handler) -> ModelScopeService:
    """Build a ModelScopeService whose httpx client uses a mock transport."""
    transport = httpx.MockTransport(handler)
    svc = ModelScopeService(endpoint="https://modelscope.cn")
    svc._client = httpx.AsyncClient(transport=transport)
    return svc


class TestBuildFileUrl:
    def test_model_url(self):
        svc = ModelScopeService(endpoint="https://modelscope.cn")
        url = svc.build_file_url("Qwen/Qwen3-0.6B", "model", "master", "config.json")
        assert url == (
            "https://modelscope.cn/api/v1/models/Qwen/Qwen3-0.6B/repo"
            "?Revision=master&FilePath=config.json"
        )

    def test_dataset_url(self):
        svc = ModelScopeService(endpoint="https://modelscope.cn")
        url = svc.build_file_url("ZhipuAI/LongBench", "dataset", "master", "data/test.json")
        assert url == (
            "https://modelscope.cn/api/v1/datasets/ZhipuAI/LongBench/repo"
            "?Revision=master&FilePath=data%2Ftest.json"
        )

    def test_revision_quote_plus(self):
        svc = ModelScopeService()
        url = svc.build_file_url("a/b", "model", "v1.0.0", "f w.txt")
        assert "Revision=v1.0.0" in url
        assert "FilePath=f+w.txt" in url  # space -> +

    def test_unsupported_repo_type(self):
        svc = ModelScopeService()
        with pytest.raises(InvalidParameter):
            svc.build_file_url("a/b", "skill", "master", "f.txt")


class TestBuildAuthHeaders:
    def test_with_token(self):
        svc = ModelScopeService(token="ms-abc")
        headers = svc.build_auth_headers()
        assert headers["Cookie"] == "m_session_id=ms-abc"
        assert headers["Authorization"] == "Bearer ms-abc"

    def test_no_token(self):
        svc = ModelScopeService()
        assert svc.build_auth_headers() == {}

    def test_override_token(self):
        svc = ModelScopeService(token="ms-ctor")
        headers = svc.build_auth_headers("ms-override")
        assert "ms-override" in headers["Cookie"]
        assert "ms-override" in headers["Authorization"]


class TestExtractCommitHash:
    def test_short_id_prefix_match(self):
        files = [
            {"Path": "config.json", "Type": "blob", "Size": 100,
             "Revision": "6d077077a1b2c3d4e5f6789012345678901234ab"},
            {"Path": "model.bin", "Type": "blob", "Size": 999,
             "Revision": "abc12345a1b2c3d4e5f6789012345678901234cd"},
        ]
        short_id = "6d077077"
        result = ModelScopeService._extract_commit_hash(files, short_id)
        assert result == "6d077077a1b2c3d4e5f6789012345678901234ab"

    def test_fallback_pseudo_commit(self):
        files = [
            {"Path": "config.json", "Type": "blob", "Size": 100, "Sha256": "abc"},
            {"Path": "model.bin", "Type": "blob", "Size": 999, "Sha256": "def"},
        ]
        result = ModelScopeService._extract_commit_hash(files, "")
        # pseudo_commit is deterministic for same input
        result2 = ModelScopeService._extract_commit_hash(files, "")
        assert result == result2
        assert len(result) == 64  # sha256 hex

    def test_short_id_no_match_falls_back(self):
        files = [{"Path": "f.txt", "Type": "blob", "Size": 1, "Revision": "abc123"}]
        result = ModelScopeService._extract_commit_hash(files, "ffffff")
        assert len(result) == 64  # fell back to pseudo_commit


class TestExtractData:
    def test_nested_data_dict(self):
        body = {"Data": {"Files": [{"Path": "a"}]}}
        result = ModelScopeService._extract_data(body)
        assert result == {"Files": [{"Path": "a"}]}

    def test_bare_data_list(self):
        body = {"Data": [{"Path": "a"}]}
        result = ModelScopeService._extract_data(body)
        assert result == [{"Path": "a"}]

    def test_no_data_falls_back_to_body(self):
        body = {"Files": [{"Path": "a"}]}
        result = ModelScopeService._extract_data(body)
        assert result == body  # whole body returned


class TestRaiseForStatus:
    """Verify _raise_for_status maps status codes to exception classes.

    This is the R3 fix verification: confirms we do NOT call
    modelscope_hub.errors.raise_for_status (which would AttributeError on
    req.path_url), and instead map status codes ourselves.
    """

    @pytest.mark.asyncio
    async def test_200_no_raise(self):
        def handler(req):
            return httpx.Response(200, json={"Data": {"Files": []}})
        svc = _make_service_with_mock(handler)
        resp = await svc._client.get("https://modelscope.cn/api/v1/models/x/repo/files")
        svc._raise_for_status(resp)  # should not raise

    @pytest.mark.parametrize("status,exc_cls", [
        (404, NotExistError),
        (401, AuthenticationError),
        (403, PermissionDeniedError),
        (429, RateLimitError),
        (500, ServerError),
        (502, ServerError),
        (400, InvalidParameter),
    ])
    @pytest.mark.asyncio
    async def test_error_status_maps_to_exception(self, status, exc_cls):
        def handler(req):
            return httpx.Response(status, json={"Code": status, "Message": f"err {status}"})
        svc = _make_service_with_mock(handler)
        resp = await svc._client.get("https://modelscope.cn/api/v1/models/x/repo/files")
        with pytest.raises(exc_cls):
            svc._raise_for_status(resp)

    @pytest.mark.asyncio
    async def test_429_retry_after_parsed(self):
        def handler(req):
            return httpx.Response(
                429,
                headers={"Retry-After": "5"},
                json={"Message": "rate limited"},
            )
        svc = _make_service_with_mock(handler)
        resp = await svc._client.get("https://modelscope.cn/api/v1/models/x/repo/files")
        with pytest.raises(RateLimitError) as exc_info:
            svc._raise_for_status(resp)
        assert exc_info.value.retry_after == 5

    @pytest.mark.asyncio
    async def test_message_extracted_from_body(self):
        def handler(req):
            return httpx.Response(404, json={"Message": "repo not found yo"})
        svc = _make_service_with_mock(handler)
        resp = await svc._client.get("https://modelscope.cn/api/v1/models/x/repo/files")
        with pytest.raises(NotExistError, match="repo not found yo"):
            svc._raise_for_status(resp)


class TestFetchModelTreeRaw:
    @pytest.mark.asyncio
    async def test_extracts_files_and_latest_committer(self):
        payload = {"Data": {"Files": [{"Path": "config.json", "Type": "blob"}],
                            "LatestCommitter": {"ShortId": "abc12345", "CommittedDate": 1753546348}}}

        def handler(req):
            return httpx.Response(200, json=payload)
        svc = _make_service_with_mock(handler)
        data = await svc._fetch_tree_raw("Qwen/Qwen3-0.6B", "model", "master")
        assert data["Files"][0]["Path"] == "config.json"
        assert data["LatestCommitter"]["ShortId"] == "abc12345"
        assert data["LatestCommitter"]["CommittedDate"] == 1753546348

    @pytest.mark.asyncio
    async def test_bare_list_response(self):
        """When Data is a bare list, get_repo_tree returns it directly."""
        payload = {"Data": [{"Path": "a"}, {"Path": "b"}]}

        def handler(req):
            return httpx.Response(200, json=payload)
        svc = _make_service_with_mock(handler)
        files = await svc.get_repo_tree("a/b", "model", "master")
        assert [f["Path"] for f in files] == ["a", "b"]


class TestFetchDatasetTreeRawPagination:
    @pytest.mark.asyncio
    async def test_aggregates_pages_and_keeps_first_page_committer(self):
        """Dataset pagination: aggregate Files across pages, take LatestCommitter
        from page 1 only."""
        page_size = 200
        page1_files = [{"Path": f"f{i}"} for i in range(page_size)]
        page2_files = [{"Path": f"g{i}"} for i in range(5)]  # < page_size -> stop
        call_count = 0

        def handler(req):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return httpx.Response(200, json={"Data": {
                    "Files": page1_files,
                    "LatestCommitter": {"ShortId": "deadbeef", "CommittedDate": 111},
                }})
            return httpx.Response(200, json={"Data": {"Files": page2_files}})

        svc = _make_service_with_mock(handler)
        data = await svc._fetch_tree_raw("ZhipuAI/LongBench", "dataset", "master")
        assert len(data["Files"]) == page_size + 5
        assert data["LatestCommitter"]["ShortId"] == "deadbeef"  # from page 1
        assert data["LatestCommitter"]["CommittedDate"] == 111
        assert call_count == 2  # exactly 2 requests

    @pytest.mark.asyncio
    async def test_single_page_when_under_page_size(self):
        """If first page has fewer than page_size files, no second request."""
        files = [{"Path": f"f{i}"} for i in range(10)]
        call_count = 0

        def handler(req):
            nonlocal call_count
            call_count += 1
            return httpx.Response(200, json={"Data": {
                "Files": files,
                "LatestCommitter": {"ShortId": "abc", "CommittedDate": 222},
            }})

        svc = _make_service_with_mock(handler)
        data = await svc._fetch_tree_raw("a/b", "dataset", "master")
        assert len(data["Files"]) == 10
        assert call_count == 1


class TestResolveCommit:
    @pytest.mark.asyncio
    async def test_returns_real_sha_on_short_id_match(self):
        payload = {"Data": {
            "Files": [
                {"Path": "config.json", "Type": "blob", "Size": 100,
                 "Revision": "6d077077a1b2c3d4e5f6789012345678901234ab"},
            ],
            "LatestCommitter": {"ShortId": "6d077077", "CommittedDate": 1753546348},
        }}

        def handler(req):
            return httpx.Response(200, json=payload)
        svc = _make_service_with_mock(handler)
        commit_hash, files, committed_at = await svc.resolve_commit("a/b", "model", "master")
        assert commit_hash == "6d077077a1b2c3d4e5f6789012345678901234ab"
        assert len(commit_hash) == 40
        assert committed_at == 1753546348
        assert len(files) == 1

    @pytest.mark.asyncio
    async def test_falls_back_to_pseudo_commit_when_no_match(self):
        payload = {"Data": {
            "Files": [
                {"Path": "config.json", "Type": "blob", "Size": 100, "Sha256": "abc",
                 "Revision": "ffffffffa1b2c3d4e5f6789012345678901234ab"},
            ],
            "LatestCommitter": {"ShortId": "6d077077", "CommittedDate": 1753546348},
        }}

        def handler(req):
            return httpx.Response(200, json=payload)
        svc = _make_service_with_mock(handler)
        commit_hash, _files, committed_at = await svc.resolve_commit("a/b", "model", "master")
        assert len(commit_hash) == 64  # pseudo_commit
        assert committed_at == 1753546348

    @pytest.mark.asyncio
    async def test_raises_invalid_parameter_for_unsupported_type(self):
        svc = _make_service_with_mock(lambda req: httpx.Response(200, json={}))
        with pytest.raises(InvalidParameter):
            await svc.resolve_commit("a/b", "skill", "master")


class TestValidateRepoAccess:
    @pytest.mark.asyncio
    async def test_public_repo_success(self):
        payload = {"Data": {
            "Files": [{"Path": "config.json", "Type": "blob", "Size": 100,
                       "Revision": "6d077077a1b2c3d4e5f6789012345678901234ab"}],
            "LatestCommitter": {"ShortId": "6d077077", "CommittedDate": 1753546348},
        }}

        def handler(req):
            return httpx.Response(200, json=payload)
        svc = _make_service_with_mock(handler)
        is_valid, msg, requires_token, sha = await svc.validate_repo_access(
            "Qwen/Qwen3-0.6B", "model", "master"
        )
        assert is_valid is True
        assert msg == ""
        assert requires_token is False
        assert sha == "6d077077a1b2c3d4e5f6789012345678901234ab"

    @pytest.mark.asyncio
    async def test_404_returns_not_found(self):
        def handler(req):
            return httpx.Response(404, json={"Message": "repo not found"})
        svc = _make_service_with_mock(handler)
        is_valid, msg, requires_token, sha = await svc.validate_repo_access(
            "nonexistent/repo", "model", "master"
        )
        assert is_valid is False
        assert "not found" in msg.lower()
        assert requires_token is False
        assert sha is None

    @pytest.mark.asyncio
    async def test_401_returns_requires_token(self):
        def handler(req):
            return httpx.Response(401, json={"Message": "unauthorized"})
        svc = _make_service_with_mock(handler)
        is_valid, msg, requires_token, sha = await svc.validate_repo_access(
            "private/repo", "model", "master"
        )
        assert is_valid is False
        assert requires_token is True
        assert sha is None

    @pytest.mark.asyncio
    async def test_403_returns_requires_token(self):
        def handler(req):
            return httpx.Response(403, json={"Message": "forbidden"})
        svc = _make_service_with_mock(handler)
        is_valid, msg, requires_token, sha = await svc.validate_repo_access(
            "gated/repo", "model", "master"
        )
        assert is_valid is False
        assert requires_token is True
        assert sha is None

    @pytest.mark.asyncio
    async def test_429_returns_transient_failure(self):
        def handler(req):
            return httpx.Response(429, headers={"Retry-After": "10"},
                                   json={"Message": "rate limited"})
        svc = _make_service_with_mock(handler)
        is_valid, msg, requires_token, sha = await svc.validate_repo_access(
            "a/b", "model", "master"
        )
        assert is_valid is False
        assert requires_token is False  # transient, not a token issue
        assert "rate limit" in msg.lower()
        assert sha is None

    @pytest.mark.asyncio
    async def test_500_returns_transient_failure(self):
        def handler(req):
            return httpx.Response(500, json={"Message": "boom"})
        svc = _make_service_with_mock(handler)
        is_valid, msg, requires_token, sha = await svc.validate_repo_access(
            "a/b", "model", "master"
        )
        assert is_valid is False
        assert requires_token is False  # transient, not a token issue
        assert "server error" in msg.lower()
        assert sha is None

    @pytest.mark.asyncio
    async def test_unsupported_repo_type(self):
        svc = _make_service_with_mock(lambda req: httpx.Response(200, json={}))
        is_valid, msg, requires_token, sha = await svc.validate_repo_access(
            "a/b", "skill", "master"
        )
        assert is_valid is False
        assert requires_token is False
        assert sha is None
