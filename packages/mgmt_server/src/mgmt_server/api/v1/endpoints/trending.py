"""Trending repositories endpoint - proxies HuggingFace trending API with caching."""

from fastapi import APIRouter, HTTPException
from httpx import AsyncClient, HTTPError

from cache.keys import CacheKeys
from mgmt_server.api.deps import CacheServiceDep
from mgmt_server.api.v1.schemas.trending import (
    TrendingListResponse,
    TrendingRepoResponse,
)

router = APIRouter()

HF_TRENDING_URL = "https://hf-mirror.com/api/trending"
HF_TRENDING_PARAMS = {"type": "all", "limit": 20}
ALLOWED_REPO_TYPES = {"model", "dataset"}
MAX_RESULTS = 12


@router.get("/", response_model=TrendingListResponse)
async def get_trending(cache: CacheServiceDep) -> TrendingListResponse:
    """Get trending repositories from HuggingFace.

    Transforms hf.co/api/trending response (nested {recentlyTrending: [...]})
    into a flat array of simplified repo objects. Results are cached for 5 minutes.
    """
    cached = await cache.get(CacheKeys.trending.key("data"))
    if cached is not None:
        return TrendingListResponse(**cached)

    try:
        async with AsyncClient() as client:
            response = await client.get(HF_TRENDING_URL, params=HF_TRENDING_PARAMS)
            response.raise_for_status()
            raw = response.json()
    except HTTPError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch trending data from HuggingFace: {e}",
        )

    recently_trending = raw.get("recentlyTrending", [])
    repos = [
        TrendingRepoResponse(
            repo_id=item["repoData"]["id"],
            author=item["repoData"]["author"],
            repo_type=item["repoType"],
            downloads=item["repoData"].get("downloads", 0),
            likes=item["repoData"].get("likes", 0),
            pipeline_tag=item["repoData"].get("pipeline_tag"),
        )
        for item in recently_trending
        if item.get("repoType") in ALLOWED_REPO_TYPES
    ][:MAX_RESULTS]

    result = TrendingListResponse(data=repos)
    await cache.set(CacheKeys.trending.key("data"), result.model_dump(), ttl=CacheKeys.trending.ttl)
    return result
