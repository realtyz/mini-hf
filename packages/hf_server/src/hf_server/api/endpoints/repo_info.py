from fastapi import APIRouter, HTTPException

from database.db_repositories import HfRepoProfileRepository
from hf_server.api.deps import DbDep
from hf_server.schemas.repo_info import RepoInfoResponse
from hf_server.services.metadata_service import MetadataService

router = APIRouter(tags=["Repo Info"])


@router.get(
    "/api/{namespace}/{repo_name}/revision/{rev}",
    response_model=RepoInfoResponse,
)
@router.get(
    "/api/models/{namespace}/{repo_name}/revision/{rev}",
    response_model=RepoInfoResponse,
)
async def get_model_info(
    namespace: str,
    repo_name: str,
    rev: str,
    db: DbDep,
) -> RepoInfoResponse:
    """Get model info by namespace, repo_name and revision."""
    repo_id = f"{namespace}/{repo_name}"
    profile_repo = HfRepoProfileRepository(db)

    # Check if profile exists
    profile = await profile_repo.get_profile(repo_id, "model")
    if profile is None:
        raise HTTPException(status_code=404, detail="Model not found")

    service = MetadataService(db)
    snapshot = await service.get_model_info(namespace, repo_name, rev)

    if snapshot is None:
        raise HTTPException(status_code=404, detail="Model not found")

    # Increment downloads counter
    await profile_repo.increment_downloads(repo_id, "model")

    return RepoInfoResponse(
        id=snapshot.id,
        sha=snapshot.commit_hash,
    )


@router.get(
    "/api/datasets/{namespace}/{repo_name}/revision/{rev}",
    response_model=RepoInfoResponse,
)
async def get_dataset_info(
    namespace: str,
    repo_name: str,
    rev: str,
    db: DbDep,
) -> RepoInfoResponse:
    """Get dataset info by namespace, repo_name and revision."""
    repo_id = f"{namespace}/{repo_name}"
    profile_repo = HfRepoProfileRepository(db)

    # Check if profile exists
    profile = await profile_repo.get_profile(repo_id, "dataset")
    if profile is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    service = MetadataService(db)
    snapshot = await service.get_dataset_info(namespace, repo_name, rev)

    if snapshot is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Increment downloads counter
    await profile_repo.increment_downloads(repo_id, "dataset")

    return RepoInfoResponse(
        id=snapshot.id,
        sha=snapshot.commit_hash,
    )
