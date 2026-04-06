"""HuggingFace repository operations service."""

import asyncio
from typing import Iterable, Optional

import httpx
from huggingface_hub import (
    HfApi,
    RepoFile,
    RepoFolder,
    ModelInfo,
    DatasetInfo,
    SpaceInfo,
    hf_hub_url,
)
from huggingface_hub.errors import RepositoryNotFoundError, GatedRepoError
from huggingface_hub.utils._http import (
    fix_hf_endpoint_in_url,
    get_session,
    hf_raise_for_status,
    http_backoff,
)
from loguru import logger

from .utils import filter_repo_objects


def _paginate_with_endpoint_fix(
    path: str, params: dict, headers: dict, endpoint: Optional[str]
) -> Iterable:
    """Fetch paginated results with endpoint URL fix.

    This is a modified version of huggingface_hub.utils._pagination.paginate
    that fixes the Link header URLs to use the correct endpoint.
    """
    session = get_session()
    r = session.get(path, params=params, headers=headers)
    hf_raise_for_status(r)
    yield from r.json()

    # Follow pages with endpoint fix
    next_page = _get_next_page_fixed(r, endpoint)
    while next_page is not None:
        r = http_backoff("GET", next_page, headers=headers)
        hf_raise_for_status(r)
        yield from r.json()
        next_page = _get_next_page_fixed(r, endpoint)


def _get_next_page_fixed(
    response: httpx.Response, endpoint: Optional[str]
) -> Optional[str]:
    """Get next page URL with endpoint fix."""
    url = response.links.get("next", {}).get("url")
    if url is None:
        return None
    return fix_hf_endpoint_in_url(url, endpoint)


class HuggingfaceService:
    """HuggingFace repository operations service (async).

    Encapsulates interactions with HF Hub, providing methods to fetch
    repository tree, filter files, etc.

    Example:
        >>> # Default endpoint
        >>> service = HuggingfaceService(token="hf_xxx")
        >>> # Custom endpoint (e.g., private HF Hub or mirror)
        >>> service = HuggingfaceService(token="hf_xxx", endpoint="https://hf-mirror.com")
        >>> tree = await service.get_tree("bert-base-uncased", "model", "main")
        >>> print(f"Found {len(tree)} items")
        >>> filtered = service.filter_files([f for f in tree if isinstance(f, RepoFile)], allow_patterns=["*.bin"])
    """

    def __init__(self, token: str | None = None, endpoint: str | None = None):
        """Initialize the service.

        Args:
            token: HuggingFace API token for authentication.
            endpoint: HuggingFace Hub endpoint URL. If None, uses the default
                endpoint (https://huggingface.co). Set to a custom URL for
                private HF Hub instances or mirrors.
        """
        if endpoint is None:
            endpoint = "https://huggingface.co"
        self._api = HfApi(token=token, endpoint=endpoint)
        self._token = token
        self._endpoint = endpoint

    async def get_tree(
        self,
        repo_id: str,
        repo_type: str = "model",
        revision: str = "main",
    ) -> list[RepoFile | RepoFolder]:
        """Fetch complete repository tree structure (async).

        This method fetches the complete file tree from HuggingFace Hub,
        including all files and folders recursively.

        Args:
            repo_id: Repository ID (e.g., "bert-base-uncased").
            repo_type: Repository type ("model", "dataset", or "space").
            revision: Git revision (branch, tag, or commit hash).

        Returns:
            List of RepoFile and RepoFolder objects.

        Note:
            This method uses asyncio.to_thread internally since the
            underlying HfApi calls are synchronous.
        """
        # Fetch commit information
        repo_info = await asyncio.to_thread(
            self._api.repo_info,
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
        )

        # Fetch repository tree using custom list_repo_tree
        items = await self.list_repo_tree(
            repo_id=repo_id,
            repo_type=repo_type,
            revision=repo_info.sha,
            recursive=True,
        )

        return items

    async def list_repo_tree(
        self,
        repo_id: str,
        path_in_repo: str | None = None,
        *,
        recursive: bool = False,
        expand: bool = False,
        revision: str | None = None,
        repo_type: str | None = None,
    ) -> list[RepoFile | RepoFolder]:
        """List repository tree with custom endpoint support.

        This is a custom implementation that properly handles pagination
        when using a custom endpoint (e.g., hf-mirror.com).

        The standard HfApi.list_repo_tree() does not fix the Link header URLs
        returned by some proxies, causing pagination to redirect to huggingface.co.

        Args:
            repo_id: Repository ID (e.g., "bert-base-uncased").
            path_in_repo: Relative path of the tree in the repo.
            recursive: Whether to list recursively.
            expand: Whether to fetch additional metadata (last commit, security scan).
            revision: Git revision (branch, tag, or commit hash).
            repo_type: Repository type ("model", "dataset", or "space").

        Returns:
            List of RepoFile and RepoFolder objects.
        """
        from huggingface_hub import constants
        from urllib.parse import quote

        repo_type = repo_type or constants.REPO_TYPE_MODEL
        revision = (
            quote(revision, safe="")
            if revision is not None
            else constants.DEFAULT_REVISION
        )
        headers = self._api._build_hf_headers()

        encoded_path_in_repo = (
            "/" + quote(path_in_repo, safe="") if path_in_repo else ""
        )
        tree_url = f"{self._api.endpoint}/api/{repo_type}s/{repo_id}/tree/{revision}{encoded_path_in_repo}"

        def _fetch_tree():
            items = []
            for path_info in _paginate_with_endpoint_fix(
                path=tree_url,
                headers=headers,
                params={"recursive": recursive, "expand": expand},
                endpoint=self._api.endpoint,
            ):
                items.append(
                    RepoFile(**path_info)
                    if path_info["type"] == "file"
                    else RepoFolder(**path_info)
                )
            return items

        return await asyncio.to_thread(_fetch_tree)

    async def get_repo_info(
        self,
        repo_id: str,
        repo_type: str = "model",
        revision: str = "main",
    ) -> ModelInfo | DatasetInfo | SpaceInfo:
        """Fetch repository information (async).

        This is a lightweight method that only fetches basic repository
        information including commit_hash (sha), without fetching the full file tree.
        Use this when you need to determine the commit_hash before starting
        a download task.

        Args:
            repo_id: Repository ID (e.g., "bert-base-uncased").
            repo_type: Repository type ("model", "dataset", or "space").
            revision: Git revision (branch, tag, or commit hash).

        Returns:
            ModelInfo, DatasetInfo, or SpaceInfo object containing repository
            information including sha (commit_hash) and last_modified.

        Example:
            >>> service = HuggingfaceService(token="hf_xxx")
            >>> info = await service.get_repo_info("bert-base-uncased", "model", "main")
            >>> print(f"Commit: {info.sha}")
            >>> print(f"Size: {info.size}")
        """
        return await asyncio.to_thread(
            self._api.repo_info,
            repo_id=repo_id,
            repo_type=repo_type,
            revision=revision,
        )

    def filter_files(
        self,
        files: list[RepoFile],
        *,
        allow_patterns: list[str] | str | None = None,
        ignore_patterns: list[str] | str | None = None,
    ) -> list[RepoFile]:
        """Filter file list based on patterns.

        Args:
            files: List of RepoFile objects.
            allow_patterns: Allowed patterns (e.g., ["*.bin", "*.json"]).
                If provided, only matching files are returned.
            ignore_patterns: Ignored patterns (e.g., ["*.md", "tests/*"]).
                Matching files are excluded.

        Returns:
            Filtered list of RepoFile objects.

        Example:
            >>> filtered = service.filter_files(
            ...     files,
            ...     allow_patterns=["*.bin", "*.json"],
            ...     ignore_patterns=["*.safetensors"]
            ... )
        """
        return list(
            filter_repo_objects(
                files,
                allow_patterns=allow_patterns,
                ignore_patterns=ignore_patterns,
                key=lambda f: f.path,
            )
        )

    async def validate_repo_access(
        self,
        repo_id: str,
        repo_type: str = "model",
        revision: str = "main",
    ) -> tuple[bool, str, bool]:
        """Validate repository access and check if token is required.

        This method checks if a repository is gated or private, and validates
        that the provided token (if any) has access to the repository.

        Args:
            repo_id: Repository ID (e.g., "bert-base-uncased").
            repo_type: Repository type ("model", "dataset", or "space").
            revision: Git revision (branch, tag, or commit hash).

        Returns:
            Tuple of (is_valid, error_message, requires_token):
            - is_valid: True if access is valid, False otherwise
            - error_message: Error message if access is invalid, None otherwise
            - requires_token: True if repository requires token (gated/private)

        Example:
            >>> service = HuggingfaceService(token="hf_xxx")
            >>> is_valid, error, needs_token = await service.validate_repo_access(
            ...     "meta-llama/Llama-2-7b-hf", "model", "main"
            ... )
            >>> if not is_valid:
            ...     print(f"Access denied: {error}")
        """
        try:
            repo_info = await asyncio.to_thread(
                self._api.repo_info,
                repo_id=repo_id,
                repo_type=repo_type,
                revision=revision,
            )

            # Check if repository is private
            is_private = getattr(repo_info, "private", False)

            # Check if repository is gated
            is_gated = getattr(repo_info, "gated", False)
            if is_gated is None:
                is_gated = False

            requires_token = is_private or bool(is_gated)

            if requires_token and not self._token:
                return (
                    False,
                    f"Repository '{repo_id}' is {'private' if is_private else 'gated'}. "
                    "Please provide a valid access_token.",
                    requires_token,
                )

            # If token is provided, verify it by fetching file metadata
            if self._token:
                # Get list of files to find one for verification
                siblings = getattr(repo_info, "siblings", [])
                if siblings:
                    # Pick the first file for token verification
                    first_file = siblings[0]
                    file_path = (
                        first_file.rfilename
                        if hasattr(first_file, "rfilename")
                        else str(first_file)
                    )

                    try:
                        file_url = hf_hub_url(
                            repo_id=repo_id,
                            filename=file_path,
                            repo_type=repo_type,
                            revision=revision,
                            endpoint=self._endpoint,
                        )
                        await asyncio.to_thread(
                            self._api.get_hf_file_metadata,
                            url=file_url,
                            token=self._token,
                        )
                        logger.debug(
                            f"Token verified successfully for {repo_id} via file {file_path}"
                        )
                    except Exception as e:
                        error_msg = str(e)
                        if (
                            "401" in error_msg
                            or "403" in error_msg
                            or "Unauthorized" in error_msg
                        ):
                            return (
                                False,
                                f"Access token does not have permission to access '{repo_id}'. "
                                "Please ensure your token has the required permissions.",
                                requires_token,
                            )
                        logger.warning(f"Token verification warning for {repo_id}: {e}")
                        # Non-auth errors (like file not found) shouldn't block access
                        pass

            return True, "", requires_token

        except GatedRepoError:
            return (
                False,
                f"Repository '{repo_id}' is gated. Please provide a valid access_token.",
                True,
            )
        except RepositoryNotFoundError:
            return False, f"Repository '{repo_id}' not found.", False
        except Exception as e:
            error_msg = str(e)
            if "401" in error_msg or "403" in error_msg:
                return (
                    False,
                    f"Access denied to repository '{repo_id}'. "
                    "Please check your access_token has the required permissions.",
                    True,
                )
            # Re-raise other exceptions
            raise

    def get_file_url(
        self,
        repo_id: str,
        filename: str,
        *,
        repo_type: str = "model",
        revision: str = "main",
    ) -> str:
        """Generate HuggingFace file download URL.

        This is a convenience method that wraps hf_hub_url with the
        service's configured endpoint.

        Args:
            repo_id: Repository ID (e.g., "bert-base-uncased").
            filename: File path relative to repo root.
            repo_type: Repository type ("model", "dataset", or "space").
            revision: Git revision (branch, tag, or commit hash).

        Returns:
            Full download URL for the file.
        """
        return hf_hub_url(
            repo_id=repo_id,
            filename=filename,
            repo_type=repo_type,
            revision=revision,
            endpoint=self._endpoint,
        )
