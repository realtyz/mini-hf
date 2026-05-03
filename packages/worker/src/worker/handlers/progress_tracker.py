"""Task progress tracking service using Redis.

This module provides progress tracking for task downloads and uploads, storing both
task-level and file-level progress in Redis for real-time querying.
"""

from datetime import datetime, timezone

from cache import cache_service
from loguru import logger


class TaskProgressTracker:
    """Track task download progress in Redis.

    Stores both task-level summary and individual file progress.
    Data is automatically cleaned up when the task completes or fails.

    Example:
        tracker = TaskProgressTracker(task_id=123)

        # Initialize task
        await tracker.init_task(total_files=10, total_bytes=1000000)

        # Track individual files
        await tracker.start_file("model.bin", total_bytes=500000)
        await tracker.update_file_progress("model.bin", downloaded=250000, speed=10000)
        await tracker.complete_file("model.bin")

        # Clean up on completion
        await tracker.clear()
    """

    DEFAULT_TTL = 86400  # 24 hours

    def __init__(self, task_id: int, cache=None):
        self.task_id = task_id
        self._task_key = f"task_progress:{task_id}"
        self._files_key = f"task_files:{task_id}"
        self._files_list_key = f"task_files_list:{task_id}"
        self._cache = cache or cache_service

    def _file_key(self, file_path: str) -> str:
        """Generate Redis key for a specific file."""
        # Replace special characters to make safe Redis key
        safe_path = file_path.replace(":", "_").replace(" ", "_")
        return f"{self._files_key}:{safe_path}"

    async def _update_file_data(self, file_path: str, **updates) -> dict | None:
        """Read-modify-write a file progress entry.

        Returns the existing data if found (after writing), or None if the key
        doesn't exist. For methods that need computed fields based on existing
        data (e.g. downloaded_bytes = total_bytes), use the returned dict.
        """
        file_key = self._file_key(file_path)
        existing = await self._cache.get(file_key)
        if existing is None:
            logger.warning("File progress not found: {}", file_path)
            return None
        data = {**existing, **updates}
        await self._cache.set(file_key, data, ttl=self.DEFAULT_TTL)
        return data

    async def init_task(
        self,
        total_files: int,
        total_bytes: int,
    ) -> None:
        """Initialize task progress tracking.

        Args:
            total_files: Total number of files to download
            total_bytes: Total bytes to download
        """
        now = datetime.now(timezone.utc).isoformat()
        data = {
            "task_id": self.task_id,
            "status": "running",
            "total_files": total_files,
            "total_bytes": total_bytes,
            "current_file": None,
            "updated_at": now,
        }
        await self._cache.set(self._task_key, data, ttl=self.DEFAULT_TTL)

        # Initialize empty file list
        await self._cache.set(self._files_list_key, [], ttl=self.DEFAULT_TTL)

        logger.debug("Initialized progress tracking for task {}", self.task_id)

    async def start_file(self, file_path: str, total_bytes: int) -> None:
        """Initialize a file for tracking with pending status.

        The file starts in "pending" state and transitions to "downloading"
        when it actually starts downloading (acquires download semaphore).

        Args:
            file_path: Path of the file being downloaded
            total_bytes: Total size of the file in bytes
        """
        now = datetime.now(timezone.utc).isoformat()
        data = {
            "path": file_path,
            "status": "pending",
            "downloaded_bytes": 0,
            "total_bytes": total_bytes,
            "progress_percent": 0.0,
            "speed_bytes_per_sec": 0.0,
            "started_at": now,
            "completed_at": None,
            "error_message": None,
        }
        await self._cache.set(self._file_key(file_path), data, ttl=self.DEFAULT_TTL)

        # Add file to tracking list
        file_list = await self._cache.get(self._files_list_key) or []
        if file_path not in file_list:
            file_list.append(file_path)
            await self._cache.set(self._files_list_key, file_list, ttl=self.DEFAULT_TTL)

        # Update current file in task summary
        await self._update_task_summary(current_file=file_path)
        logger.debug("Initialized tracking for file: {} (pending)", file_path)

    async def batch_start_files(self, files: list[tuple[str, int]]) -> None:
        """Initialize progress tracking for multiple files in batch.

        More efficient than calling start_file() in a loop: uses mset to
        write all file data in a single Redis round-trip, and writes the
        file list only once, avoiding O(n²) read-modify-write.

        Args:
            files: List of (file_path, total_bytes) tuples
        """
        if not files:
            return

        now = datetime.now(timezone.utc).isoformat()
        file_paths = []
        file_data_mapping = {}

        for file_path, total_bytes in files:
            file_paths.append(file_path)
            file_data_mapping[self._file_key(file_path)] = {
                "path": file_path,
                "status": "pending",
                "downloaded_bytes": 0,
                "total_bytes": total_bytes,
                "progress_percent": 0.0,
                "speed_bytes_per_sec": 0.0,
                "started_at": now,
                "completed_at": None,
                "error_message": None,
            }

        # Batch-write all file data (single Redis round-trip)
        await self._cache.mset(file_data_mapping, ttl=self.DEFAULT_TTL)

        # Write file list once
        await self._cache.set(self._files_list_key, file_paths, ttl=self.DEFAULT_TTL)

        logger.debug("Initialized tracking for {} files (batch)", len(files))

    async def mark_file_downloading(self, file_path: str) -> None:
        """Mark a file as actively downloading.

        Called when the file acquires the download semaphore and starts
        the actual download process.

        Args:
            file_path: Path of the file starting download
        """
        await self._update_file_data(
            file_path,
            status="downloading",
            download_started_at=datetime.now(timezone.utc).isoformat(),
        )
        logger.debug("File is now downloading: {}", file_path)

    async def update_file_progress(
        self,
        file_path: str,
        downloaded: int,
        total: int | None,
        speed: float,
    ) -> None:
        """Update progress for a specific file.

        Args:
            file_path: Path of the file
            downloaded: Bytes downloaded so far
            total: Total file size (optional)
            speed: Download speed in bytes per second
        """
        if not await self._update_file_data(
            file_path,
            downloaded_bytes=downloaded,
            total_bytes=total or 0,
            speed_bytes_per_sec=round(speed, 2),
        ):
            return

        # Update current file in task summary
        await self._update_task_summary(current_file=file_path)

    async def complete_file(self, file_path: str) -> None:
        """Mark a file as completed.

        Args:
            file_path: Path of the completed file
        """
        now = datetime.now(timezone.utc).isoformat()
        file_key = self._file_key(file_path)
        existing = await self._cache.get(file_key)
        if existing is None:
            logger.warning("File progress not found: {}", file_path)
            return
        existing.update(
            status="completed",
            speed_bytes_per_sec=0.0,
            completed_at=now,
            downloaded_bytes=existing.get("total_bytes", 0),
        )
        await self._cache.set(file_key, existing, ttl=self.DEFAULT_TTL)
        logger.debug("Completed file: {}", file_path)

    async def start_file_upload(self, file_path: str, total_bytes: int) -> None:
        """Mark a file as uploading.

        Args:
            file_path: Path of the file
            total_bytes: Total file size in bytes
        """
        await self._update_file_data(
            file_path,
            status="uploading",
            processed_bytes=0,
            speed_bytes_per_sec=0.0,
            upload_started_at=datetime.now(timezone.utc).isoformat(),
        )
        logger.debug("Started upload tracking for file: {}", file_path)

    async def update_file_upload_progress(
        self,
        file_path: str,
        uploaded: int,
        total: int | None,
        speed: float,
    ) -> None:
        """Update file upload progress.

        Args:
            file_path: Path of the file
            uploaded: Bytes uploaded so far
            total: Total file size (optional)
            speed: Upload speed in bytes per second
        """
        await self._update_file_data(
            file_path,
            status="uploading",
            processed_bytes=uploaded,
            total_bytes=total or 0,
            speed_bytes_per_sec=round(speed, 2),
        )

    async def complete_file_upload(self, file_path: str) -> None:
        """Mark a file upload as completed.

        Args:
            file_path: Path of the file
        """
        now = datetime.now(timezone.utc).isoformat()
        file_key = self._file_key(file_path)
        existing = await self._cache.get(file_key)
        if existing is None:
            logger.warning("File progress not found: {}", file_path)
            return
        existing.update(
            status="completed",
            speed_bytes_per_sec=0.0,
            upload_completed_at=now,
            processed_bytes=existing.get("total_bytes", 0),
        )
        await self._cache.set(file_key, existing, ttl=self.DEFAULT_TTL)
        logger.debug("Completed upload for file: {}", file_path)

    async def fail_file_upload(self, file_path: str, error_message: str) -> None:
        """Mark a file upload as failed.

        Args:
            file_path: Path of the file
            error_message: Error message describing the failure
        """
        await self._update_file_data(
            file_path,
            status="failed",
            upload_error_message=error_message,
            upload_completed_at=datetime.now(timezone.utc).isoformat(),
        )
        logger.debug("Failed upload for file: {} - {}", file_path, error_message)

    async def fail_file(self, file_path: str, error_message: str) -> None:
        """Mark a file as failed.

        Args:
            file_path: Path of the failed file
            error_message: Error message describing the failure
        """
        await self._update_file_data(
            file_path,
            status="failed",
            error_message=error_message,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        logger.debug("Failed file: {} - {}", file_path, error_message)

    async def _update_task_summary(self, **updates) -> None:
        """Update specific fields in task summary."""
        existing = await self._cache.get(self._task_key)
        if existing is None:
            return

        data = {
            **existing,
            **updates,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await self._cache.set(self._task_key, data, ttl=self.DEFAULT_TTL)

    async def complete_task(self) -> None:
        """Mark the entire task as completed."""
        await self._update_task_summary(status="completed")
        logger.info("Task {} completed, progress tracking finished", self.task_id)

    async def fail_task(self, error_message: str) -> None:
        """Mark the entire task as failed.

        Args:
            error_message: Error message describing the failure
        """
        await self._update_task_summary(
            status="failed",
            error_message=error_message,
        )
        logger.info("Task {} failed: {}", self.task_id, error_message)

    async def get_progress(self) -> dict | None:
        """Get current task progress.

        Returns:
            Task progress data or None if not initialized
        """
        return await self._cache.get(self._task_key)

    async def get_file_progress(self, file_path: str) -> dict | None:
        """Get progress for a specific file.

        Args:
            file_path: Path of the file

        Returns:
            File progress data or None if not found
        """
        return await self._cache.get(self._file_key(file_path))

    async def get_all_file_progress(self) -> list[dict]:
        """Get progress for all files in the task.

        Returns:
            List of file progress data, sorted by path.
        """
        file_list = await self._cache.get(self._files_list_key) or []
        if not file_list:
            return []

        keys = [self._file_key(path) for path in file_list]
        values = await self._cache.mget(keys)

        files = [v for v in values if v]
        files.sort(key=lambda x: x.get("path", ""))
        return files

    async def get_progress_snapshot(self) -> tuple[int, int]:
        """Get a snapshot of actual download progress.

        Returns:
            Tuple of (completed_file_count, downloaded_bytes)
        """
        files = await self.get_all_file_progress()
        completed = sum(1 for f in files if f.get("status") == "completed")
        downloaded = sum(f.get("downloaded_bytes", 0) for f in files)
        return completed, downloaded

    async def clear(self) -> None:
        """Clear all progress data for this task from Redis.

        Should be called when the task completes or fails.
        """
        # Delete task summary
        await self._cache.delete(self._task_key)

        # Delete all file progress entries using the tracking list
        file_list = await self._cache.get(self._files_list_key) or []
        file_keys = [self._file_key(path) for path in file_list]
        if file_keys:
            await self._cache.delete_many(file_keys)

        # Delete the tracking list
        await self._cache.delete(self._files_list_key)

        logger.debug(
            "Cleared progress tracking for task {} ({} files)",
            self.task_id,
            len(file_list),
        )
