"""ModelScope repository operations service."""

import hashlib
import json
import uuid
from typing import Any
from urllib.parse import quote_plus

import httpx
from modelscope_hub.errors import (
    AuthenticationError,
    InvalidParameter,
    NotExistError,
    PermissionDeniedError,
    RateLimitError,
    ServerError,
)

# NOTE: do NOT import raise_for_status -- it calls _extract_payload which accesses
# req.path_url (a requests-only attribute absent on httpx.Request -> AttributeError).
# Use ModelScopeService._raise_for_status instead. See R3 in the phase-2 plan.

DEFAULT_ENDPOINT = "https://modelscope.cn"
DEFAULT_TIMEOUT = 30
DEFAULT_PAGE_SIZE = 200

_VALID_REPO_TYPES = ("model", "dataset")


class ModelScopeService:
    """ModelScope repository operations service (async).

    Direct HTTP client for the ModelScope Legacy API. No SDK coupling beyond
    reusing ``modelscope_hub.errors`` for exception taxonomy (Decision C).

    Example:
        >>> service = ModelScopeService(token="ms-xxx")
        >>> commit, files, committed_at = await service.resolve_commit(
        ...     "Qwen/Qwen3-0.6B", "model", "master"
        ... )
        >>> url = service.build_file_url("Qwen/Qwen3-0.6B", "model", "master", "config.json")
    """

    def __init__(self, token: str | None = None, endpoint: str | None = None):
        if endpoint is None:
            endpoint = DEFAULT_ENDPOINT
        self._token = token
        self._endpoint = endpoint.rstrip("/")
        self._client = self._build_client()

    async def close(self) -> None:
        """Close the underlying httpx.AsyncClient, releasing pooled connections."""
        await self._client.aclose()

    async def __aenter__(self) -> "ModelScopeService":
        return self

    async def __aexit__(self, *exc_info: object) -> bool:
        await self.close()
        return False

    def _build_client(self) -> httpx.AsyncClient:
        transport = httpx.AsyncHTTPTransport(retries=5)
        return httpx.AsyncClient(
            transport=transport,
            timeout=httpx.Timeout(DEFAULT_TIMEOUT),
        )

    def _build_url(self, path: str) -> str:
        return f"{self._endpoint}/api/v1/{path.lstrip('/')}"

    def _build_headers(self) -> dict[str, str]:
        """Build request headers with auth + X-Request-ID (mirrors SDK _headers)."""
        headers: dict[str, str] = {"X-Request-ID": uuid.uuid4().hex}
        headers.update(self.build_auth_headers())
        return headers

    # --- public API ---

    async def get_repo_tree(
        self,
        repo_id: str,
        repo_type: str,
        revision: str = "master",
    ) -> list[dict]:
        """Fetch complete repository file tree from ModelScope.

        Args:
            repo_id: Repository ID (e.g., "Qwen/Qwen3-0.6B").
            repo_type: "model" or "dataset". Others raise InvalidParameter.
            revision: Branch/tag/commit SHA (default "master").

        Returns:
            List of file entry dicts. Each has keys: Path, Type, Size, Sha256,
            BlobId, Revision (per-file commit SHA), CommittedDate. Directory
            entries (Type=="tree") are included; caller filters as needed.

        Raises:
            InvalidParameter: repo_type not in ("model", "dataset").
            NotExistError: Repository or revision not found.
            AuthenticationError/PermissionDeniedError: token invalid/insufficient.
        """
        data = await self._fetch_tree_raw(repo_id, repo_type, revision)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return data.get("Files", [])
        return []

    async def resolve_commit(
        self,
        repo_id: str,
        repo_type: str,
        revision: str = "master",
    ) -> tuple[str, list[dict], int | None]:
        """Resolve the HEAD commit SHA of a repository and return the file tree.

        Uses ``LatestCommitter.ShortId`` (short SHA) as a prefix to match against
        per-file ``Revision`` entries (full 40-char SHA) in the file tree
        response. The matched full SHA is the HEAD commit of the file tree.

        Args:
            repo_id: Repository ID.
            repo_type: "model" or "dataset".
            revision: Branch/tag/commit SHA (default "master").

        Returns:
            Tuple of (commit_hash, file_entries, committed_at):
            - commit_hash: Full 40-char HEAD commit SHA, or pseudo_commit
              (sha256 of sorted (path, sha256, size)) as fallback.
            - file_entries: Raw file entry dicts from the tree response.
            - committed_at: LatestCommitter.CommittedDate as Unix timestamp
              (int), e.g. 1753546348. None if absent.

        Raises:
            InvalidParameter: Unsupported repo_type.
            NotExistError: Repository/revision not found.
            AuthenticationError/PermissionDeniedError: Auth failures.
        """
        data = await self._fetch_tree_raw(repo_id, repo_type, revision)
        if isinstance(data, list):
            files = data
        elif isinstance(data, dict):
            files = data.get("Files", [])
        else:
            files = []
        latest_committer = data.get("LatestCommitter", {}) if isinstance(data, dict) else {}
        short_id = latest_committer.get("ShortId", "") or ""
        commit_hash = self._extract_commit_hash(files, short_id)
        committed_at = latest_committer.get("CommittedDate")
        return commit_hash, files, committed_at

    def build_file_url(
        self,
        repo_id: str,
        repo_type: str,
        revision: str,
        file_path: str,
    ) -> str:
        """Build single-file download URL.

        Format: ``{endpoint}/api/v1/{type}s/{repo_id}/repo?Revision={rev}&FilePath={path}``
        Revision and FilePath are quote_plus encoded (analysis §2.4).

        repo_type mapping: model -> models, dataset -> datasets.

        Raises:
            InvalidParameter: repo_type not in ("model", "dataset").
        """
        if repo_type not in _VALID_REPO_TYPES:
            raise InvalidParameter(
                f"Unsupported repo_type '{repo_type}'. Only 'model' and 'dataset' "
                "are supported."
            )
        type_segment = f"{repo_type}s"  # model -> models, dataset -> datasets
        return (
            f"{self._endpoint}/api/v1/{type_segment}/{repo_id}/repo"
            f"?Revision={quote_plus(revision)}"
            f"&FilePath={quote_plus(file_path)}"
        )

    def build_auth_headers(self, token: str | None = None) -> dict[str, str]:
        """Build auth headers for ModelScope API requests.

        When token is present, sends dual credentials for max compatibility:
        - ``Cookie: m_session_id={token}`` (legacy endpoints)
        - ``Authorization: Bearer {token}`` (newer endpoints)

        When token is None/empty, returns empty dict (public repos need no auth).
        """
        t = token or self._token
        if not t:
            return {}
        return {
            "Cookie": f"m_session_id={t}",
            "Authorization": f"Bearer {t}",
        }

    async def validate_repo_access(
        self,
        repo_id: str,
        repo_type: str,
        revision: str = "master",
    ) -> tuple[bool, str, bool, str | None]:
        """Validate repository access and check if token is required.

        Mirrors ``HuggingfaceService.validate_repo_access`` signature and return
        contract: ``(is_valid, error_message, requires_token, commit_hash)``.
        Token comes from ``self._token`` (set at construction), not a method
        parameter -- callers construct a new ModelScopeService(token=...) per
        validation, exactly as they do for HuggingfaceService.

        Strategy: attempt to fetch the file tree. If it succeeds, the repo is
        accessible and we resolve commit_hash. If it fails with auth errors,
        the repo requires token (or token is invalid). If 404, the repo doesn't
        exist. RateLimitError (429) and ServerError (5xx) are caught and
        returned as transient failures (requires_token=False) -- not re-raised.
        """
        try:
            commit_hash, _files, _committed_at = await self.resolve_commit(
                repo_id, repo_type, revision
            )
            # Access succeeded -- if no token was needed, repo is public.
            # ModelScope file tree response doesn't expose private/gated flag,
            # so we can't distinguish "token was required but happened to be
            # set" from "repo is public". Set requires_token=False on success
            # (matches HF behavior when repo is public).
            return True, "", False, commit_hash
        except AuthenticationError:
            # 401: no token or invalid token
            return (
                False,
                f"Repository '{repo_id}' requires authentication. "
                "Please provide a valid access_token.",
                True,
                None,
            )
        except PermissionDeniedError:
            # 403: token lacks permission
            return (
                False,
                f"Access denied to repository '{repo_id}'. "
                "Please ensure your token has the required permissions.",
                True,
                None,
            )
        except NotExistError:
            return False, f"Repository '{repo_id}' not found.", False, None
        except InvalidParameter as e:
            return False, str(e), False, None
        except RateLimitError:
            # 429: upstream rate limit hit -- transient, not a config error
            return (
                False,
                f"Upstream rate limit reached for '{repo_id}'. Please retry later.",
                False,
                None,
            )
        except ServerError as e:
            # 5xx: upstream unavailable -- transient, not a config error
            return (
                False,
                f"Upstream server error for '{repo_id}': {e}. Please retry later.",
                False,
                None,
            )

    # --- internal helpers ---

    async def _fetch_tree_raw(
        self, repo_id: str, repo_type: str, revision: str
    ) -> dict | list:
        """Fetch raw Data from the ModelScope file tree endpoint.

        Returns the full Data object including Files and LatestCommitter. For
        paginated (dataset) responses, aggregates Files across all pages and
        takes LatestCommitter from the first page.
        """
        if repo_type not in _VALID_REPO_TYPES:
            raise InvalidParameter(
                f"Unsupported repo_type '{repo_type}'. Only 'model' and 'dataset' "
                "are supported."
            )
        if repo_type == "model":
            return await self._fetch_model_tree_raw(repo_id, revision)
        return await self._fetch_dataset_tree_raw(repo_id, revision)

    async def _fetch_model_tree_raw(self, repo_id: str, revision: str) -> dict | list:
        """Non-paginated model file tree."""
        resp = await self._client.get(
            self._build_url(f"models/{repo_id}/repo/files"),
            params={"Revision": revision, "Recursive": "True"},
            headers=self._build_headers(),
        )
        self._raise_for_status(resp)
        return self._extract_data(resp.json())

    async def _fetch_dataset_tree_raw(
        self, repo_id: str, revision: str, page_size: int = DEFAULT_PAGE_SIZE
    ) -> dict:
        """Paginated dataset file tree. Aggregates all pages into a single Data dict."""
        all_files: list[dict] = []
        latest_committer: dict = {}
        page_number = 1
        while True:
            resp = await self._client.get(
                self._build_url(f"datasets/{repo_id}/repo/tree"),
                params={
                    "Revision": revision,
                    "Recursive": "True",
                    "PageNumber": page_number,
                    "PageSize": page_size,
                },
                headers=self._build_headers(),
            )
            self._raise_for_status(resp)
            data = self._extract_data(resp.json())
            if isinstance(data, list):
                files = data
            elif isinstance(data, dict):
                files = data.get("Files", [])
                if page_number == 1:
                    latest_committer = data.get("LatestCommitter", {})
            else:
                files = []
            all_files.extend(files)
            if len(files) < page_size:
                break
            page_number += 1
        return {"Files": all_files, "LatestCommitter": latest_committer}

    @staticmethod
    def _extract_data(body: dict) -> Any:
        """Extract the 'Data' field from a legacy API JSON response.

        Mirrors SDK's ``_json_data``: falls back to the entire body if 'Data'
        is absent (handles both ``{"Data": {"Files": [...]}}`` and ``{"Data": [...]}``).
        """
        return body.get("Data", body)

    @staticmethod
    def _extract_commit_hash(files: list[dict], short_id: str) -> str:
        """Extract HEAD commit SHA from file tree response.

        Strategy (Decision B):
        1. Use LatestCommitter.ShortId (short SHA) as a prefix.
        2. Prefix-match ShortId against per-file Revision (full 40-char SHA).
        3. Fallback: pseudo_commit = sha256(sorted((path, sha256, size))).
        """
        # Strategy 1+2: ShortId prefix match
        if short_id:
            for f in files:
                rev = f.get("Revision") or f.get("CommitId")
                if rev and len(rev) == 40 and rev.startswith(short_id):
                    return rev

        # Fallback: pseudo_commit
        items = sorted(
            (
                f.get("Path", ""),
                f.get("Sha256") or f.get("BlobId") or "",
                f.get("Size", 0),
            )
            for f in files
            if f.get("Type") == "blob"
        )
        return hashlib.sha256(json.dumps(items).encode()).hexdigest()

    @staticmethod
    def _raise_for_status(resp: httpx.Response) -> None:
        """Map httpx non-2xx status to modelscope_hub.errors exceptions.

        Cannot reuse ``modelscope_hub.errors.raise_for_status`` directly: it calls
        ``_extract_payload`` which accesses ``req.path_url`` (a requests-only
        attribute absent on httpx.Request -> AttributeError). Instead we read
        status_code and body ourselves, reusing the modelscope_hub.errors
        exception classes.
        """
        status = resp.status_code
        if status < 400:
            return
        # Best-effort body parse (mirrors _extract_payload's .json()/.text fallback)
        try:
            body = resp.json()
        except ValueError:
            body = resp.text or None
        message = ""
        if isinstance(body, dict):
            for key in ("Message", "message", "msg", "Msg", "error", "Error", "detail", "Detail"):
                value = body.get(key)
                if isinstance(value, str) and value.strip():
                    message = value.strip()
                    break
        if not message:
            message = f"HTTP {status} on {resp.request.method} {resp.request.url}"
        request_id = resp.headers.get("x-request-id") or resp.headers.get("X-Request-Id")
        if status == 401:
            raise AuthenticationError(
                message, status_code=status, request_id=request_id,
                response_body=body, url=str(resp.url), method=resp.request.method,
            )
        if status == 403:
            raise PermissionDeniedError(
                message, status_code=status, request_id=request_id,
                response_body=body, url=str(resp.url), method=resp.request.method,
            )
        if status == 404:
            raise NotExistError(
                message, status_code=status, request_id=request_id,
                response_body=body, url=str(resp.url), method=resp.request.method,
            )
        if status == 429:
            retry_after_raw = resp.headers.get("Retry-After")
            retry_after: int | float | None = None
            if retry_after_raw:
                try:
                    retry_after = int(retry_after_raw)
                except ValueError:
                    try:
                        retry_after = float(retry_after_raw)
                    except ValueError:
                        pass
            raise RateLimitError(
                message, status_code=status, request_id=request_id,
                response_body=body, url=str(resp.url), method=resp.request.method,
                retry_after=retry_after,
            )
        if status >= 500:
            raise ServerError(
                message, status_code=status, request_id=request_id,
                response_body=body, url=str(resp.url), method=resp.request.method,
            )
        # Other 4xx (400/405/406/409/410/422...) -> InvalidParameter (SDK default for 4xx)
        raise InvalidParameter(
            message, status_code=status, request_id=request_id,
            response_body=body, url=str(resp.url), method=resp.request.method,
        )
