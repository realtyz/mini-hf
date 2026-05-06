"""FastAPI application entry point."""

import click
from contextlib import asynccontextmanager

from loguru import logger
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn


from mgmt_server.api.v1.router import api_router as v1_router
from mgmt_server.core.exceptions import BusinessError
from mgmt_server.core.init_db import init_db
from database.db_models.base import Base
from database.core import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting MiniHF MANAGEMENT API Server...")
    try:
        await init_db()
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        # Continue starting the server even if init fails
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown
    logger.info("Shutting down MiniHF MANAGEMENT API Server...")


app = FastAPI(
    title="MiniHF Management API Server",
    description="MiniHF Management API Server",
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
app.include_router(v1_router, prefix="/api/v1")


@app.exception_handler(BusinessError)
async def business_error_handler(request: Request, exc: BusinessError) -> JSONResponse:
    """Convert BusinessError subclasses to unified API responses."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.status_code, "message": exc.message, "data": None},
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Convert Pydantic validation errors to unified API responses."""
    errors = exc.errors()
    detail = "; ".join(
        f"{'.'.join(str(loc) for loc in e['loc'])}: {e['msg']}" for e in errors
    )
    return JSONResponse(
        status_code=422,
        content={"code": 422, "message": detail, "data": None},
    )


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
        "mgmt_server.main:app",
        host=host,
        port=port,
        reload=reload,
    )


@click.command()
@click.option("--host", default="0.0.0.0", help="Host to bind to")
@click.option("--port", default=9800, help="Port to bind to")
@click.option("--reload", is_flag=True, help="Enable auto-reload for development")
def cli(host: str, port: int, reload: bool) -> None:
    """CLI entry point for the mini-hf server."""
    run(host=host, port=port, reload=reload)


if __name__ == "__main__":
    cli()
