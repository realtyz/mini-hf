"""Worker entry point using PostgreSQL FOR UPDATE SKIP LOCKED.

This is the main entry point for starting the task worker.
It creates a Worker instance, registers all task handlers, and starts
processing tasks from the queue.

Usage:
    # Start a single worker
    uv run python -m worker.main

    # Start with debug mode (enables SQL echo)
    uv run python -m worker.main --debug

    # Start multiple workers (for testing concurrent processing)
    # Terminal 1: uv run python -m worker.main
    # Terminal 2: uv run python -m worker.main
    # Terminal 3: uv run python -m worker.main
"""

import asyncio
import os

import click
from loguru import logger

from worker.worker import Worker
from worker.handlers import register_handlers


# Parse arguments before importing other modules to ensure DEBUG is set
# before database engine is created
@click.command()
@click.option("--debug", is_flag=True, help="Enable debug mode (SQL echo)")
def cli(debug: bool) -> None:
    """Worker entry point."""
    if debug:
        os.environ["DEBUG"] = "true"
    asyncio.run(main())


async def main() -> None:
    """Main entry point."""
    # Create worker instance
    worker = Worker()

    # Register all task handlers
    register_handlers(worker)

    # Start the worker
    try:
        await worker.start()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        worker.stop()


if __name__ == "__main__":
    cli()
