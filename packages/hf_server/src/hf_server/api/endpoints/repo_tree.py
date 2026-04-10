from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from database.db_models import HfRepoSnapshot, HfRepoTreeItem, SnapshotStatus
from hf_server.api.deps import DbDep
from hf_server.api.schemas.responses.repo_tree import RepoTreeItemResponse, RepoTreeLfsInfo
from hf_server.utils.pagination import decode_cursor, encode_cursor, CursorError

router = APIRouter(tags=["Repo Tree"])

# Default limit matching HuggingFace API behavior
DEFAULT_LIMIT = 50
MAX_LIMIT = 1000


def _build_tree_response(items: list[HfRepoTreeItem]) -> list[RepoTreeItemResponse]:
    """Convert RepoTreeItem models to response schema."""
    result = []
    for item in items:
        lfs_info = None
        if item.lfs_oid is not None:
            lfs_info = RepoTreeLfsInfo(
                oid=item.lfs_oid,
                size=item.lfs_size or 0,
                pointerSize=item.lfs_pointer_size or 0,
            )
        result.append(
            RepoTreeItemResponse(
                type=item.type,
                oid=item.oid or "",
                size=item.size,
                path=item.path,
                lfs=lfs_info,
            )
        )
    return result


def _build_link_header(
    request: Request, next_cursor: Optional[str], limit: int
) -> Optional[str]:
    """Build Link header for cursor-based pagination.

    Follows GitHub-style Link header format as expected by huggingface_hub:
    <url>; rel="next"
    """
    if not next_cursor:
        return None

    # Build next page URL preserving all query parameters
    query_params = dict(request.query_params)
    query_params["cursor"] = next_cursor
    query_params["limit"] = str(limit)

    next_url = f"{request.url.scheme}://{request.url.netloc}{request.url.path}?{urlencode(query_params)}"
    return f'<{next_url}>; rel="next"'


async def _get_repo_tree(
    db: DbDep,
    request: Request,
    repo_id: str,
    repo_type: str,
    revision: str,
    cursor: Optional[str] = None,
    limit: int = DEFAULT_LIMIT,
) -> JSONResponse:
    """Get repository tree items using cursor-based pagination.

    Args:
        db: Database session
        request: FastAPI request object
        repo_id: Repository ID (e.g., "facebook/bart-large")
        repo_type: "model" or "dataset"
        revision: Branch/tag name
        cursor: Optional cursor for pagination (base64-encoded path)
        limit: Maximum items per page (default 50, max 1000)
    """
    # Validate limit parameter
    if limit < 1:
        raise HTTPException(status_code=400, detail="Limit must be at least 1")
    if limit > MAX_LIMIT:
        raise HTTPException(
            status_code=400, detail=f"Limit cannot exceed {MAX_LIMIT}"
        )

    # Get active snapshot to find commit_hash
    snapshot_stmt = select(HfRepoSnapshot).where(
        HfRepoSnapshot.repo_id == repo_id,
        HfRepoSnapshot.repo_type == repo_type,
        HfRepoSnapshot.revision == revision,
        HfRepoSnapshot.status == SnapshotStatus.ACTIVE,
    )
    result = await db.execute(snapshot_stmt)
    snapshot = result.scalar_one_or_none()

    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail=f"Repository '{repo_id}' not found or revision '{revision}' does not exist",
        )

    # Decode cursor if provided
    cursor_path: Optional[str] = None
    if cursor:
        try:
            cursor_path = decode_cursor(cursor)
        except CursorError as e:
            raise HTTPException(
                status_code=400, detail=f"Invalid cursor format: {str(e)}"
            )

    # Build the query with cursor-based pagination
    # We fetch limit + 1 to determine if there's a next page
    query_limit = limit + 1

    tree_stmt = (
        select(HfRepoTreeItem)
        .where(HfRepoTreeItem.commit_hash == snapshot.commit_hash)
        .order_by(HfRepoTreeItem.path.asc())
    )

    # Apply cursor filter if provided
    if cursor_path:
        tree_stmt = tree_stmt.where(HfRepoTreeItem.path > cursor_path)

    # Apply limit
    tree_stmt = tree_stmt.limit(query_limit)

    result = await db.execute(tree_stmt)
    items = list(result.scalars().all())

    # Handle empty result
    if not items:
        return JSONResponse(content=[])

    # Determine if there's a next page
    has_more = len(items) > limit
    if has_more:
        # Remove the extra item we fetched
        items = items[:limit]
        next_cursor = encode_cursor(items[-1].path)
    else:
        next_cursor = None

    # Build response data
    data = _build_tree_response(items)

    # Build Link header
    link_header = _build_link_header(request, next_cursor, limit)

    # Convert Pydantic models to dicts for JSON serialization
    content = [item.model_dump() for item in data]

    # Build response with Link header
    response = JSONResponse(content=content)
    if link_header:
        response.headers["Link"] = link_header

    return response


@router.get(
    "/api/{namespace}/{repo_name}/tree/{rev}",
    response_model=list[RepoTreeItemResponse],
)
@router.get(
    "/api/models/{namespace}/{repo_name}/tree/{rev}",
    response_model=list[RepoTreeItemResponse],
)
async def list_model_repo_tree(
    namespace: str,
    repo_name: str,
    rev: str,
    db: DbDep,
    request: Request,
    cursor: Optional[str] = Query(
        None,
        description="Pagination cursor (base64-encoded path) for fetching next page",
    ),
    limit: int = Query(
        DEFAULT_LIMIT,
        ge=1,
        le=MAX_LIMIT,
        description=f"Number of items per page (max {MAX_LIMIT})",
    ),
) -> JSONResponse:
    """Get model repository tree by namespace, repo_name and revision.

    Uses cursor-based pagination for efficient traversal of large repositories.
    """
    repo_id = f"{namespace}/{repo_name}"
    return await _get_repo_tree(db, request, repo_id, "model", rev, cursor, limit)


@router.get(
    "/api/datasets/{namespace}/{repo_name}/tree/{rev}",
    response_model=list[RepoTreeItemResponse],
)
async def list_dataset_repo_tree(
    namespace: str,
    repo_name: str,
    rev: str,
    db: DbDep,
    request: Request,
    cursor: Optional[str] = Query(
        None,
        description="Pagination cursor (base64-encoded path) for fetching next page",
    ),
    limit: int = Query(
        DEFAULT_LIMIT,
        ge=1,
        le=MAX_LIMIT,
        description=f"Number of items per page (max {MAX_LIMIT})",
    ),
) -> JSONResponse:
    """Get dataset repository tree by namespace, repo_name and revision.

    Uses cursor-based pagination for efficient traversal of large repositories.
    """
    repo_id = f"{namespace}/{repo_name}"
    return await _get_repo_tree(db, request, repo_id, "dataset", rev, cursor, limit)
