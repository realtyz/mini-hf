"""Single-file download endpoint for ModelScope Legacy API.

``GET /api/v1/{models|datasets}/{namespace}/{repo_name}/repo?Revision={rev}&FilePath={path}``

Resolves the cached blob and 302-redirects to an S3 presigned URL. Only GET is
registered: ``modelscope_hub`` downloads via streaming GET, not HEAD (the only
``requests.head`` in the SDK is gated behind an inter-region env var that LAN
caching never sets). See analysis doc §2.4 and the plan step 4.8 note.

Errors use FastAPI's default ``{"detail": "..."}`` body (raised via
``HTTPException``); the SDK's ``raise_for_status`` routes by HTTP status code
and reads the message from a case-insensitive key list that includes ``detail``.
"""

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from ms_server.api.deps import DbDep
from ms_server.services.metadata_service import MsMetadataService
from storage.client import s3_client
from storage.utils.key_builder import build_ms_blob_key

router = APIRouter(tags=["File Download"])

DEFAULT_REVISION = "master"


def _validate_file_path(path: str) -> str:
    """Validate file path to prevent path traversal attacks.

    Checks for:
    - Path traversal sequences (..)
    - Absolute paths (starting with /)
    - Windows-style absolute paths (starting with C:, etc.)

    Returns normalized path without leading slashes.

    Copied verbatim from ``hf_server``'s ``file_metadata._validate_file_path``
    to keep validation behavior identical across the two API servers.
    """
    # Block path traversal
    if ".." in path:
        raise HTTPException(
            status_code=400,
            detail="Invalid path: '..' sequence not allowed",
        )

    # Block absolute paths
    if path.startswith("/"):
        raise HTTPException(
            status_code=400,
            detail="Invalid path: absolute paths not allowed",
        )

    # Block Windows absolute paths (C:, D:, etc.)
    if len(path) >= 2 and path[1] == ":":
        raise HTTPException(
            status_code=400,
            detail="Invalid path: absolute paths not allowed",
        )

    # Normalize and return
    normalized = path.replace("\\", "/")
    return normalized


@router.get("/api/v1/models/{namespace}/{repo_name}/repo")
@router.get("/api/v1/datasets/{namespace}/{repo_name}/repo")
async def download_file(
    request: Request,
    namespace: str,
    repo_name: str,
    db: DbDep,
    revision: str = Query(DEFAULT_REVISION, alias="Revision"),
    filepath: str = Query(..., alias="FilePath"),
) -> RedirectResponse:
    """Redirect (302) to an S3 presigned URL for the requested file."""
    filepath = _validate_file_path(filepath)
    repo_type = "model" if request.url.path.startswith("/api/v1/models/") else "dataset"
    repo_id = f"{namespace}/{repo_name}"
    service = MsMetadataService(db)

    # Resolve snapshot by repo_id, repo_type and revision (commit hash or branch/tag)
    snapshot = await service.get_snapshot_by_repo_and_rev(repo_id, repo_type, revision)
    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail="repository or snapshot not found",
        )

    # Locate the tree item for this file path
    tree_item = await service.get_tree_item(snapshot.commit_hash, filepath)
    if tree_item is None:
        raise HTTPException(status_code=404, detail="file not found")

    # blob_id: prefer lfs_oid for LFS files, otherwise use oid
    blob_id = tree_item.lfs_oid if tree_item.lfs_oid else tree_item.oid
    if not blob_id:
        raise HTTPException(
            status_code=500,
            detail=f"File metadata corrupted: {filepath}",
        )

    # Build MS-specific S3 key and verify the object exists in storage
    key = build_ms_blob_key(repo_id, repo_type, blob_id)

    s3_metadata = await s3_client.get_file_metadata(key)
    if s3_metadata is None:
        raise HTTPException(
            status_code=500,
            detail=(
                f"File metadata mismatch: {filepath} exists in database "
                "but not in storage"
            ),
        )

    # Range/resume is handled by the client re-issuing Range against the
    # presigned URL after the 302; S3 returns 206 directly.
    presigned_url = await s3_client.create_presigned_url(key)
    return RedirectResponse(presigned_url, status_code=302)
