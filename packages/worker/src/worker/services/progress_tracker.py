"""Task progress tracking service using Redis.

This module provides progress tracking for task downloads and uploads, storing both
task-level and file-level progress in Redis for real-time querying.
"""

from datetime import datetime, timezone
from typing import Protocol

from cache import cache_service
from loguru import logger


class ProgressInfo(Protocol):
    """Protocol for progress information."""

    processed_bytes: int
    total_bytes: int | None
    speed_bytes_per_sec: float


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

    def __init__(self, task_id: int):
        self.task_id = task_id
        self._task_key = f"task_progress:{task_id}"
        self._files_key = f"task_files:{task_id}"
        self._files_list_key = f"task_files_list:{task_id}"

    def _file_key(self, file_path: str) -> str:
        """Generate Redis key for a specific file."""
        # Replace special characters to make safe Redis key
        safe_path = file_path.replace(":", "_").replace(" ", "_")
        return f"{self._files_key}:{safe_path}"

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
        await cache_service.set(self._task_key, data, ttl=self.DEFAULT_TTL)

        # Initialize empty file list
        await cache_service.set(self._files_list_key, [], ttl=self.DEFAULT_TTL)

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
        await cache_service.set(self._file_key(file_path), data, ttl=self.DEFAULT_TTL)

        # Add file to tracking list
        file_list = await cache_service.get(self._files_list_key) or []
        if file_path not in file_list:
            file_list.append(file_path)
            await cache_service.set(
                self._files_list_key, file_list, ttl=self.DEFAULT_TTL
            )

        # Update current file in task summary
        await self._update_task_summary(current_file=file_path)
        logger.debug("Initialized tracking for file: {} (pending)", file_path)

    async def batch_start_files(self, files: list[tuple[str, int]]) -> None:
        """批量初始化多个文件的进度跟踪。

        比循环调用 start_file() 更高效：使用 mset 一次批量写入所有文件数据，
        文件列表也只写一次，避免 O(n²) 的 read-modify-write。

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

        # 批量写入所有文件数据（一次 Redis 往返）
        await cache_service.mset(file_data_mapping, ttl=self.DEFAULT_TTL)

        # 写入文件列表（只写一次）
        await cache_service.set(self._files_list_key, file_paths, ttl=self.DEFAULT_TTL)

        logger.debug("Initialized tracking for {} files (batch)", len(files))

    async def mark_file_downloading(self, file_path: str) -> None:
        """Mark a file as actively downloading.

        Called when the file acquires the download semaphore and starts
        the actual download process.

        Args:
            file_path: Path of the file starting download
        """
        file_key = self._file_key(file_path)
        existing = await cache_service.get(file_key)

        if existing is None:
            logger.warning("Cannot mark as downloading, file not found: {}", file_path)
            return

        now = datetime.now(timezone.utc).isoformat()
        data = {
            **existing,
            "status": "downloading",
            "download_started_at": now,
        }
        await cache_service.set(file_key, data, ttl=self.DEFAULT_TTL)
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
        file_key = self._file_key(file_path)
        existing = await cache_service.get(file_key)

        if existing is None:
            # File not initialized, initialize it first
            await self.start_file(file_path, total or 0)
            existing = await cache_service.get(file_key)

        if existing is None:
            logger.warning("Failed to get or create file progress for {}", file_path)
            return

        total_bytes = total or existing.get("total_bytes", 0)

        data = {
            **existing,
            "downloaded_bytes": downloaded,
            "total_bytes": total_bytes,
            "speed_bytes_per_sec": round(speed, 2),
        }
        await cache_service.set(file_key, data, ttl=self.DEFAULT_TTL)

        # Update current file in task summary
        await self._update_task_summary(current_file=file_path)

    async def complete_file(self, file_path: str) -> None:
        """Mark a file as completed.

        Args:
            file_path: Path of the completed file
        """
        file_key = self._file_key(file_path)
        existing = await cache_service.get(file_key)

        if existing is None:
            logger.warning("Cannot complete file progress, not found: {}", file_path)
            return

        now = datetime.now(timezone.utc).isoformat()
        data = {
            **existing,
            "status": "completed",
            "downloaded_bytes": existing.get("total_bytes", 0),
            "speed_bytes_per_sec": 0.0,
            "completed_at": now,
        }
        await cache_service.set(file_key, data, ttl=self.DEFAULT_TTL)

        logger.debug("Completed file: {}", file_path)

    async def start_file_upload(self, file_path: str, total_bytes: int) -> None:
        """标记文件开始上传。

        Args:
            file_path: 文件路径
            total_bytes: 文件总大小（字节）
        """
        file_key = self._file_key(file_path)
        existing = await cache_service.get(file_key)

        if existing is None:
            logger.warning("Cannot start upload for non-existent file: {}", file_path)
            return

        now = datetime.now(timezone.utc).isoformat()
        data = {
            **existing,
            "status": "uploading",
            "processed_bytes": 0,
            "speed_bytes_per_sec": 0.0,
            "upload_started_at": now,
        }
        await cache_service.set(file_key, data, ttl=self.DEFAULT_TTL)

        logger.debug("Started upload tracking for file: {}", file_path)

    async def update_file_upload_progress(
        self,
        file_path: str,
        uploaded: int,
        total: int | None,
        speed: float,
    ) -> None:
        """更新文件上传进度。

        Args:
            file_path: 文件路径
            uploaded: 已上传字节数
            total: 文件总大小（可选）
            speed: 上传速度（字节/秒）
        """
        file_key = self._file_key(file_path)
        existing = await cache_service.get(file_key)

        if existing is None:
            logger.warning("Cannot update upload progress for non-existent file: {}", file_path)
            return

        total_bytes = total or existing.get("total_bytes", 0)

        data = {
            **existing,
            "status": "uploading",
            "processed_bytes": uploaded,
            "total_bytes": total_bytes,
            "speed_bytes_per_sec": round(speed, 2),
        }
        await cache_service.set(file_key, data, ttl=self.DEFAULT_TTL)

    async def complete_file_upload(self, file_path: str) -> None:
        """标记文件上传完成。

        Args:
            file_path: 文件路径
        """
        file_key = self._file_key(file_path)
        existing = await cache_service.get(file_key)

        if existing is None:
            logger.warning("Cannot complete upload for non-existent file: {}", file_path)
            return

        now = datetime.now(timezone.utc).isoformat()
        data = {
            **existing,
            "status": "completed",
            "processed_bytes": existing.get("total_bytes", 0),
            "speed_bytes_per_sec": 0.0,
            "upload_completed_at": now,
        }
        await cache_service.set(file_key, data, ttl=self.DEFAULT_TTL)

        logger.debug("Completed upload for file: {}", file_path)

    async def fail_file_upload(self, file_path: str, error_message: str) -> None:
        """标记文件上传失败。

        Args:
            file_path: 文件路径
            error_message: 错误信息
        """
        file_key = self._file_key(file_path)
        existing = await cache_service.get(file_key)

        if existing is None:
            logger.warning("Cannot fail upload for non-existent file: {}", file_path)
            return

        now = datetime.now(timezone.utc).isoformat()
        data = {
            **existing,
            "status": "failed",
            "upload_error_message": error_message,
            "upload_completed_at": now,
        }
        await cache_service.set(file_key, data, ttl=self.DEFAULT_TTL)

        logger.debug("Failed upload for file: {} - {}", file_path, error_message)

    async def fail_file(self, file_path: str, error_message: str) -> None:
        """Mark a file as failed.

        Args:
            file_path: Path of the failed file
            error_message: Error message describing the failure
        """
        file_key = self._file_key(file_path)
        existing = await cache_service.get(file_key)

        if existing is None:
            logger.warning("Cannot fail file progress, not found: {}", file_path)
            return

        now = datetime.now(timezone.utc).isoformat()
        data = {
            **existing,
            "status": "failed",
            "error_message": error_message,
            "completed_at": now,
        }
        await cache_service.set(file_key, data, ttl=self.DEFAULT_TTL)

        logger.debug("Failed file: {} - {}", file_path, error_message)

    async def _update_task_summary(self, **updates) -> None:
        """Update specific fields in task summary."""
        existing = await cache_service.get(self._task_key)
        if existing is None:
            return

        data = {
            **existing,
            **updates,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await cache_service.set(self._task_key, data, ttl=self.DEFAULT_TTL)

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
        return await cache_service.get(self._task_key)

    async def get_file_progress(self, file_path: str) -> dict | None:
        """Get progress for a specific file.

        Args:
            file_path: Path of the file

        Returns:
            File progress data or None if not found
        """
        return await cache_service.get(self._file_key(file_path))

    async def get_all_file_progress(self) -> list[dict]:
        """Get progress for all files in the task.

        Returns:
            List of file progress data
        """
        # Get all file paths from tracking list
        file_list = await cache_service.get(self._files_list_key) or []

        files = []
        for file_path in file_list:
            file_data = await cache_service.get(self._file_key(file_path))
            if file_data:
                files.append(file_data)

        # Already sorted by insertion order, but ensure consistent ordering
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
        await cache_service.delete(self._task_key)

        # Delete all file progress entries using the tracking list
        file_list = await cache_service.get(self._files_list_key) or []
        file_keys = [self._file_key(path) for path in file_list]
        if file_keys:
            await cache_service.delete_many(file_keys)

        # Delete the tracking list
        await cache_service.delete(self._files_list_key)

        logger.debug(
            "Cleared progress tracking for task {} ({} files)",
            self.task_id,
            len(file_list),
        )
