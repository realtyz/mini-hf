from fastapi import APIRouter

from hf_server.api.endpoints import file_metadata, repo_info, repo_tree

api_router = APIRouter()

api_router.include_router(repo_info.router)
api_router.include_router(repo_tree.router)
api_router.include_router(file_metadata.router)
