"""File-tree endpoints for ModelScope Legacy API.

- model: ``GET /api/v1/models/{ns}/{name}/repo/files`` (non-paginated, full tree)
- dataset: ``GET /api/v1/datasets/{ns}/{name}/repo/tree`` (page-number pagination)

Both return the ``{"Code": 200, "Data": {"Files": [...]}, "Message": "success"}``
envelope. Pagination terminates when ``len(Files) < PageSize``; the response
omits ``Total`` (the SDK ignores it). See analysis doc §2.2/§2.3.
"""

from fastapi import APIRouter, HTTPException, Query

from ms_server.api.deps import DbDep
from ms_server.services.metadata_service import MsMetadataService
from ms_server.utils.response_builder import tree_item_to_ms_entry

router = APIRouter(tags=["Repo Files"])

DEFAULT_REVISION = "master"
DEFAULT_PAGE_SIZE = 200
MAX_PAGE_SIZE = 1000


def _build_envelope(files: list[dict]) -> dict:
    return {"Code": 200, "Data": {"Files": files}, "Message": "success"}


@router.get("/api/v1/models/{namespace}/{repo_name}/repo/files")
async def list_model_files(
    namespace: str,
    repo_name: str,
    db: DbDep,
    revision: str = Query(DEFAULT_REVISION, alias="Revision"),
    recursive: bool = Query(True, alias="Recursive"),
    root: str | None = Query(None, alias="Root"),
) -> dict:
    """List all files in a model repository (non-paginated).

    The DB tree is already the full recursive listing, so ``Recursive`` is
    accepted but has no effect. ``Root`` narrows the result to a sub-path.
    """
    repo_id = f"{namespace}/{repo_name}"
    service = MsMetadataService(db)

    snapshot = await service.get_snapshot_by_repo_and_rev(repo_id, "model", revision)
    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail="repository or snapshot not found",
        )

    items = await service.get_file_tree_filtered(snapshot.commit_hash, root)
    files = [tree_item_to_ms_entry(it) for it in items]
    return _build_envelope(files)


@router.get("/api/v1/datasets/{namespace}/{repo_name}/repo/tree")
async def list_dataset_files(
    namespace: str,
    repo_name: str,
    db: DbDep,
    revision: str = Query(DEFAULT_REVISION, alias="Revision"),
    recursive: bool = Query(True, alias="Recursive"),
    page_number: int = Query(1, ge=1, alias="PageNumber"),
    page_size: int = Query(
        DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, alias="PageSize"
    ),
    root: str | None = Query(None, alias="Root"),
) -> dict:
    """List dataset files with page-number pagination.

    The SDK stops paging when ``len(Files) < PageSize``. When the last page is
    exactly full it requests one more (empty) page before stopping, so we
    return the real item count per page and never pad. The response omits
    ``Total`` since the SDK does not read it.
    """
    repo_id = f"{namespace}/{repo_name}"
    service = MsMetadataService(db)

    snapshot = await service.get_snapshot_by_repo_and_rev(
        repo_id, "dataset", revision
    )
    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail="repository or snapshot not found",
        )

    if root is None:
        # DB-level pagination
        items, _total = await service.get_file_tree_paginated(
            snapshot.commit_hash, page_number, page_size
        )
    else:
        # Root filter requires the full tree, then slice in memory
        filtered = await service.get_file_tree_filtered(
            snapshot.commit_hash, root
        )
        start = (page_number - 1) * page_size
        end = start + page_size
        items = filtered[start:end]

    files = [tree_item_to_ms_entry(it) for it in items]
    return _build_envelope(files)
