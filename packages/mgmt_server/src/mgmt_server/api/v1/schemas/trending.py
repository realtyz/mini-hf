"""Trending repositories schemas."""

from pydantic import BaseModel, Field

from mgmt_server.api.v1.schemas.base import BaseResponse


class TrendingRepoResponse(BaseModel):
    """Trending repository item from HuggingFace."""

    repo_id: str = Field(
        ..., description="Repository ID in 'namespace/repo-name' format"
    )
    author: str
    repo_type: str = Field(..., description="Repository type: model, dataset, or space")
    downloads: int = Field(0, ge=0)
    likes: int = Field(0, ge=0)
    pipeline_tag: str | None = Field(None)


TrendingListResponse = BaseResponse[list[TrendingRepoResponse]]
