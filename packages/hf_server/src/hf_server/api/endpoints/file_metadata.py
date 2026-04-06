from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from hf_server.api.deps import DbDep
from hf_server.services.metadata_service import MetadataService
from storage.client import s3_client
from storage.utils.key_builder import build_blob_key

router = APIRouter(tags=["File Metadata"])

ERR_NOT_FOUND_HEADERS = {
    "X-Error-Code": "EntryNotFound",
    "X-Error-Message": "Entry not found",
}

ERR_INTERNAL_HEADERS = {
    "X-Error-Code": "InternalError",
    "X-Error-Message": "Internal server error",
}


@router.head("/{namespace}/{repo_name}/resolve/{rev}/{rfilename:path}")
@router.head("/models/{namespace}/{repo_name}/resolve/{rev}/{rfilename:path}")
async def get_model_file_metadata(
    namespace: str,
    repo_name: str,
    rev: str,
    rfilename: str,
    db: DbDep,
):
    """Get model file metadata and redirect to presigned URL."""
    repo_id = f"{namespace}/{repo_name}"
    service = MetadataService(db)

    # Get snapshot by repo_id, repo_type and rev
    snapshot = await service.get_snapshot_by_repo_and_rev(repo_id, "model", rev)
    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail=f"File not found: {rfilename}",
            headers=ERR_NOT_FOUND_HEADERS,
        )

    # Get tree item by commit_hash and file path
    tree_item = await service.get_tree_item(snapshot.commit_hash, rfilename)
    if tree_item is None:
        raise HTTPException(
            status_code=404,
            detail=f"File not found: {rfilename}",
            headers=ERR_NOT_FOUND_HEADERS,
        )

    # Get blob_id: prefer lfs_oid for LFS files, otherwise use oid
    blob_id = tree_item.lfs_oid if tree_item.lfs_oid else tree_item.oid
    if not blob_id:
        raise HTTPException(
            status_code=500,
            detail=f"File metadata corrupted: {rfilename}",
            headers=ERR_INTERNAL_HEADERS,
        )

    # Build S3 key for the blob
    key = build_blob_key(repo_id, "model", blob_id)

    # Get S3 file metadata
    s3_metadata = await s3_client.get_file_metadata(key)
    if s3_metadata is None:
        raise HTTPException(
            status_code=500,
            detail=f"File metadata mismatch: {rfilename} exists in database but not in storage",
            headers=ERR_INTERNAL_HEADERS,
        )

    # Generate presigned URL for redirect
    presigned_url = await s3_client.create_presigned_url(key)

    return RedirectResponse(
        presigned_url,
        status_code=302,
        headers={
            "X-Repo-Commit": snapshot.commit_hash,
            "X-Linked-ETag": s3_metadata["etag"],
            "X-Linked-Size": str(s3_metadata["size"]),
        },
    )


@router.head("/datasets/{namespace}/{repo_name}/resolve/{rev}/{rfilename:path}")
async def get_dataset_file_metadata(
    namespace: str,
    repo_name: str,
    rev: str,
    rfilename: str,
    db: DbDep,
):
    """Get dataset file metadata and redirect to presigned URL."""
    repo_id = f"{namespace}/{repo_name}"
    service = MetadataService(db)

    # Get snapshot by repo_id, repo_type and rev
    snapshot = await service.get_snapshot_by_repo_and_rev(repo_id, "dataset", rev)
    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail=f"File not found: {rfilename}",
            headers=ERR_NOT_FOUND_HEADERS,
        )

    # Get tree item by commit_hash and file path
    tree_item = await service.get_tree_item(snapshot.commit_hash, rfilename)
    if tree_item is None:
        raise HTTPException(
            status_code=404,
            detail=f"File not found: {rfilename}",
            headers=ERR_NOT_FOUND_HEADERS,
        )

    # Get blob_id: prefer lfs_oid for LFS files, otherwise use oid
    blob_id = tree_item.lfs_oid if tree_item.lfs_oid else tree_item.oid
    if not blob_id:
        raise HTTPException(
            status_code=500,
            detail=f"File metadata corrupted: {rfilename}",
            headers=ERR_INTERNAL_HEADERS,
        )

    # Build S3 key for the blob
    key = build_blob_key(repo_id, "dataset", blob_id)

    # Get S3 file metadata
    s3_metadata = await s3_client.get_file_metadata(key)
    if s3_metadata is None:
        raise HTTPException(
            status_code=500,
            detail=f"File metadata mismatch: {rfilename} exists in database but not in storage",
            headers=ERR_INTERNAL_HEADERS,
        )

    # Generate presigned URL for redirect
    presigned_url = await s3_client.create_presigned_url(key)

    return RedirectResponse(
        presigned_url,
        status_code=302,
        headers={
            "X-Repo-Commit": snapshot.commit_hash,
            "X-Linked-ETag": s3_metadata["etag"],
            "X-Linked-Size": str(s3_metadata["size"]),
        },
    )
