"""FastAPI application entry point."""

import click
from contextlib import asynccontextmanager

from loguru import logger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from hf_server.api import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting Huggingface API Server")
    yield
    # Shutdown
    logger.info("Shutting Huggingface API Server")


app = FastAPI(
    title="MiniHF Huggingface API Server",
    description="Huggingface API Server",
    version="0.1.0",
    lifespan=lifespan,
    swagger_ui_init_oauth={
        "usePkceWithAuthorizationCodeGrant": True,
        "clientId": "swagger-ui",
    },
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include v1 API routes with basic auth
app.include_router(api_router)


@app.get("/")
async def root():
    """Root endpoint - no auth required."""
    return {"message": "Welcome to mini-hf API", "docs": "/docs"}


def run(host: str, port: int, reload: bool = False) -> None:
    """Run the FastAPI application.

    Args:
        host: Host to bind to
        port: Port to bind to
        reload: Enable auto-reload for development
    """
    uvicorn.run(
        "hf_server.main:app",
        host=host,
        port=port,
        reload=reload,
    )


@click.command()
@click.option("--host", default="0.0.0.0", help="Host to bind to")
@click.option("--port", default=9801, help="Port to bind to")
@click.option("--reload", is_flag=True, help="Enable auto-reload for development")
def cli(host: str, port: int, reload: bool) -> None:
    """CLI entry point for the mini-hf server."""
    run(host=host, port=port, reload=reload)


if __name__ == "__main__":
    cli()
