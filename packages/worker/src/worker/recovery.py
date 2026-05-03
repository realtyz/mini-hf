"""Startup recovery — crash recovery for orphaned tasks and stuck profiles."""

import asyncio
import os
import time
from pathlib import Path
from typing import Awaitable, Callable

from loguru import logger

from core import settings
from database import new_session
from services.task import TaskService

StartupRecoveryFunc = Callable[[], Awaitable[None]]

INCOMPLETE_SUFFIX = ".incomplete"


def _cleanup_stale_incomplete_files(
    max_age_seconds: int | None = None,
) -> int:
    """Remove stale .incomplete files and empty directories from the temp path.

    Called at worker startup to clean up leftover files from crashed/interrupted
    downloads.
    """
    if max_age_seconds is None:
        max_age_seconds = settings.WORKER_STALE_FILE_AGE_SECONDS

    incomplete_path = Path(settings.INCOMPLETE_FILE_PATH)
    if not incomplete_path.exists():
        return 0

    now = time.time()
    removed = 0
    scanned = 0

    for dirpath, dirnames, filenames in os.walk(incomplete_path, topdown=False):
        dir_path = Path(dirpath)
        for filename in filenames:
            if not filename.endswith(INCOMPLETE_SUFFIX):
                continue
            scanned += 1
            file_path = dir_path / filename
            try:
                file_age = now - file_path.stat().st_mtime
                if file_age > max_age_seconds:
                    file_path.unlink()
                    removed += 1
                    logger.debug("Removed stale incomplete file: {}", file_path)
            except OSError:
                pass

        if scanned > 0 and scanned % 500 == 0:
            logger.debug(
                "Cleanup scan progress: {} files scanned, {} removed...",
                scanned,
                removed,
            )

        for dirname in dirnames:
            sub_dir = dir_path / dirname
            try:
                if sub_dir.exists() and not any(sub_dir.iterdir()):
                    sub_dir.rmdir()
            except OSError:
                pass

    if removed > 0:
        logger.info("Cleaned up {} stale incomplete file(s)", removed)

    return removed


class StartupRecovery:
    """Runs crash-recovery steps at worker startup.

    Three phases (in order):
    1. Cleanup stale incomplete files from temp directory
    2. Mark orphaned RUNNING tasks as FAILED
    3. Recover profiles stuck in UPDATING (delegates to source-specific functions)
    """

    def __init__(self, startup_recoveries: list[StartupRecoveryFunc] | None = None):
        self._startup_recoveries = startup_recoveries or []

    async def recover(self) -> None:
        """Run all startup recovery steps."""
        await asyncio.to_thread(_cleanup_stale_incomplete_files)

        await self._recover_orphaned_tasks()

        for recovery_func in self._startup_recoveries:
            try:
                await recovery_func()
            except Exception as e:
                logger.warning("Error during startup profile recovery: {}", e)

    @staticmethod
    async def _recover_orphaned_tasks() -> None:
        """Mark RUNNING tasks as FAILED after a worker crash.

        RUNNING means the previous worker crashed mid-processing. PAUSING
        tasks are left alone — they were paused by user request and can be
        resumed manually.
        """
        async with new_session() as session:
            ts = TaskService(session)
            count = await ts.recover_orphaned_running_tasks()
            await session.commit()
        if count:
            logger.info("Marked {} orphaned RUNNING task(s) as FAILED", count)
