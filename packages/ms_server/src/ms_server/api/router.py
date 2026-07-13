from fastapi import APIRouter

from ms_server.api.endpoints import acceleration, repo_files, file_download

api_router = APIRouter()

api_router.include_router(acceleration.router)
api_router.include_router(repo_files.router)
api_router.include_router(file_download.router)
