"""Async HTTP file downloader with resume, cancellation, and progress reporting."""

import asyncio
import time
from dataclasses import dataclass
from enum import Enum, auto
from pathlib import Path
from typing import Callable, Awaitable

import aiofiles
import httpx
from loguru import logger


class DownloaderError(Exception):
    """Base exception for download errors."""

    pass


class DownloadCancelledError(DownloaderError):
    """Download was cancelled by user request."""

    pass


class DownloadPausedError(DownloaderError):
    """Download was paused by user request."""

    pass


class DownloadError(DownloaderError):
    """Download failed (network error, checksum mismatch, etc.)."""

    pass


class RetryAction(Enum):
    """Possible retry decisions after a download attempt fails."""

    NO_RETRY = auto()
    RETRY = auto()
    RETRY_WITH_RESET = auto()  # Delete temp file and restart from byte 0


@dataclass
class ProgressInfo:
    """Download progress snapshot."""

    url: str
    target_path: Path
    downloaded_bytes: int
    total_bytes: int | None
    speed_bytes_per_sec: float
    is_resumed: bool


class HttpFileDownloader:
    """Async HTTP file downloader.

    Features:
    - Async download via httpx
    - Resume support (partial downloads saved as .incomplete)
    - External cancellation via cancel_event
    - Progress callback with rate limiting
    - Exponential backoff retry

    Usage:
        downloader = HttpFileDownloader(temp_dir="/tmp")
        try:
            await downloader.download(
                url="https://example.com/file.bin",
                target_path=Path("/cache/file.bin"),
                expected_size=1024000,
            )
        finally:
            await downloader.close()
    """

    # HTTP status codes that should not be retried
    NO_RETRY_STATUS_CODES = {400, 401, 403, 404, 405, 406, 410}

    def __init__(
        self,
        temp_dir: str | Path,
        progress_callback: Callable[[ProgressInfo], None]
        | Callable[[ProgressInfo], Awaitable[None]]
        | None = None,
        progress_interval: float = 1.0,
        max_retries: int = 5,
        retry_base_delay: float = 5.0,
        retry_max_delay: float = 30.0,
        chunk_size: int = 8192,
        client: httpx.AsyncClient | None = None,
    ):
        self.temp_dir = Path(temp_dir)
        self.progress_callback = progress_callback
        self.progress_interval = progress_interval
        self.max_retries = max_retries
        self.retry_base_delay = retry_base_delay
        self.retry_max_delay = retry_max_delay
        self.chunk_size = chunk_size

        self._cancel_event = asyncio.Event()
        self._client: httpx.AsyncClient | None = None
        self._external_client = client

    @property
    def client(self) -> httpx.AsyncClient:
        """Lazily-initialized httpx client — prefers externally injected client."""
        if self._external_client is not None:
            return self._external_client
        if self._client is None:
            self._client = httpx.AsyncClient(
                follow_redirects=True,
                timeout=30.0,
            )
        return self._client

    def cancel(self) -> None:
        """Request cancellation of the current download."""
        self._cancel_event.set()

    def reset(self) -> None:
        """Reset cancellation state so the downloader can be reused."""
        self._cancel_event.clear()

    async def close(self) -> None:
        """Close the downloader and release resources.

        Only closes the internally-created client. Externally-injected
        clients are the caller's responsibility.
        """
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _check_cancelled(self, external_event: asyncio.Event | None, url: str) -> None:
        """Raise DownloadCancelledError if the internal or external cancel event is set.

        Args:
            external_event: External cancel event
            url: URL being downloaded (for error message)

        Raises:
            DownloadCancelledError: If either cancel event is set
        """
        if self._cancel_event.is_set():
            raise DownloadCancelledError(f"Download cancelled: {url}")
        if external_event is not None and external_event.is_set():
            raise DownloadCancelledError(f"Download cancelled by task: {url}")

    @staticmethod
    def _check_paused(pause_event: asyncio.Event | None, url: str) -> None:
        """Raise DownloadPausedError if the external pause event is set.

        Unlike cancel which interrupts immediately, pause is checked
        after the current chunk is fully written, preserving file
        consistency for potential resume.
        """
        if pause_event is not None and pause_event.is_set():
            raise DownloadPausedError(f"Download paused: {url}")

    async def download(
        self,
        url: str,
        target_path: Path,
        expected_size: int | None = None,
        headers: dict[str, str] | None = None,
        cancel_event: asyncio.Event | None = None,
        pause_event: asyncio.Event | None = None,
    ) -> Path:
        """Download a single file.

        Args:
            url: File URL
            target_path: Final destination path
            expected_size: Expected file size for verification
            headers: Additional request headers
            cancel_event: External cancel event for task-level cancellation
            pause_event: External pause event for task-level pause

        Returns:
            Path to the downloaded file

        Raises:
            DownloadCancelledError: Download was cancelled
            DownloadPausedError: Download was paused
            DownloadError: Download failed after all retries
        """
        self.reset()

        # Prepare temp file and check for prior partial download
        temp_file = self._get_temp_path(target_path)
        temp_file.parent.mkdir(parents=True, exist_ok=True)

        downloaded_size = temp_file.stat().st_size if temp_file.exists() else 0
        is_resumed = downloaded_size > 0

        if is_resumed:
            logger.info(f"Resuming download from {downloaded_size} bytes: {url}")

        # Build request headers
        request_headers = dict(headers) if headers else {}
        if downloaded_size > 0:
            request_headers["Range"] = f"bytes={downloaded_size}-"

        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            self._check_cancelled(cancel_event, url)

            try:
                return await self._do_download(
                    url=url,
                    temp_file=temp_file,
                    target_path=target_path,
                    downloaded_size=downloaded_size,
                    is_resumed=is_resumed,
                    headers=request_headers,
                    expected_size=expected_size,
                    cancel_event=cancel_event,
                    pause_event=pause_event,
                )
            except (DownloadCancelledError, DownloadPausedError):
                raise
            except Exception as e:
                last_error = e

                action = self._should_retry(e, attempt)
                if action == RetryAction.NO_RETRY:
                    break

                # If reset needed (e.g. 416 error), delete temp file and restart from byte 0
                if action == RetryAction.RETRY_WITH_RESET:
                    logger.warning(
                        f"Download attempt {attempt + 1} failed for {url}: {e}. "
                        f"Resetting and restarting from byte 0..."
                    )
                    if temp_file.exists():
                        try:
                            temp_file.unlink()
                            logger.debug(f"Deleted invalid temp file: {temp_file}")
                        except OSError as unlink_error:
                            logger.warning(
                                f"Failed to delete temp file {temp_file}: {unlink_error}"
                            )
                    downloaded_size = 0
                    is_resumed = False
                    request_headers.pop("Range", None)
                else:
                    # Normal resume: update downloaded size and Range header
                    downloaded_size = (
                        temp_file.stat().st_size if temp_file.exists() else 0
                    )
                    if downloaded_size > 0:
                        request_headers["Range"] = f"bytes={downloaded_size}-"
                        is_resumed = True

                    # Calculate backoff delay
                    delay = min(
                        self.retry_base_delay * (2**attempt), self.retry_max_delay
                    )
                    logger.warning(
                        f"Download attempt {attempt + 1} failed for {url}: {e}. "
                        f"Retrying in {delay:.1f}s..."
                    )
                    await asyncio.sleep(delay)

        # All retries exhausted
        raise DownloadError(
            f"Failed to download {url} after {self.max_retries + 1} attempts: {last_error}"
        ) from last_error

    async def _do_download(
        self,
        url: str,
        temp_file: Path,
        target_path: Path,
        downloaded_size: int,
        is_resumed: bool,
        headers: dict[str, str],
        expected_size: int | None,
        cancel_event: asyncio.Event | None = None,
        pause_event: asyncio.Event | None = None,
    ) -> Path:
        """Stream the file from URL and write to temp path, then rename to target."""
        mode = "ab" if is_resumed else "wb"

        async with self.client.stream("GET", url, headers=headers) as response:
            # Verify the server honored our Range request. If we sent Range but
            # got 200 OK (instead of 206 Partial Content), the server is returning
            # the full file and we need to restart from scratch.
            if is_resumed and response.status_code == 200:
                raise DownloadError(
                    "Server ignored Range header, full content returned. "
                    "Need to restart from beginning."
                )

            # Check response status
            if response.status_code in self.NO_RETRY_STATUS_CODES:
                raise DownloadError(
                    f"HTTP {response.status_code} for {url}: {response.reason_phrase}"
                )
            response.raise_for_status()

            # Get total size from response headers
            total_size = self._get_total_size(response, downloaded_size)

            # Check cancellation before streaming
            self._check_cancelled(cancel_event, url)

            # Stream download loop
            bytes_since_last_update = 0
            last_update_time = time.monotonic()
            current_size = downloaded_size

            async with aiofiles.open(temp_file, mode) as f:
                async for chunk in response.aiter_bytes(chunk_size=self.chunk_size):
                    self._check_cancelled(cancel_event, url)

                    await f.write(chunk)
                    current_size += len(chunk)

                    # Check pause after chunk is written to keep file consistent
                    self._check_paused(pause_event, url)
                    bytes_since_last_update += len(chunk)

                    # Rate-limited progress reporting
                    now = time.monotonic()
                    elapsed = now - last_update_time
                    if elapsed >= self.progress_interval:
                        speed = bytes_since_last_update / elapsed
                        await self._report_progress(
                            url=url,
                            target_path=target_path,
                            downloaded=current_size,
                            total=total_size,
                            speed=speed,
                            is_resumed=is_resumed,
                        )
                        bytes_since_last_update = 0
                        last_update_time = now

                # Final progress report
                await self._report_progress(
                    url=url,
                    target_path=target_path,
                    downloaded=current_size,
                    total=total_size,
                    speed=0.0,
                    is_resumed=is_resumed,
                )

        # Verify downloaded size matches expected
        if expected_size is not None and current_size != expected_size:
            raise DownloadError(
                f"Size mismatch for {target_path}: "
                f"expected {expected_size}, got {current_size}"
            )

        # Atomic rename from temp to target
        target_path.parent.mkdir(parents=True, exist_ok=True)
        temp_file.rename(target_path)
        logger.info(f"Downloaded: {target_path}")

        return target_path

    def _get_temp_path(self, target_path: Path) -> Path:
        """Return the .incomplete temp path for the given target file."""
        return target_path.with_suffix(target_path.suffix + ".incomplete")

    def _get_total_size(
        self, response: httpx.Response, downloaded_size: int
    ) -> int | None:
        """Extract total file size from response headers."""
        if response.status_code == 206:  # Partial Content
            content_range = response.headers.get("Content-Range", "")
            if "/" in content_range:
                try:
                    return int(content_range.split("/")[-1])
                except ValueError:
                    pass

        content_length = response.headers.get("Content-Length")
        if content_length:
            return downloaded_size + int(content_length)

        return None

    async def _report_progress(
        self,
        url: str,
        target_path: Path,
        downloaded: int,
        total: int | None,
        speed: float,
        is_resumed: bool,
    ) -> None:
        """Call the progress callback with current download progress."""
        if self.progress_callback:
            try:
                info = ProgressInfo(
                    url=url,
                    target_path=target_path,
                    downloaded_bytes=downloaded,
                    total_bytes=total,
                    speed_bytes_per_sec=speed,
                    is_resumed=is_resumed,
                )
                result = self.progress_callback(info)
                # If the callback is a coroutine, await it
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.warning(f"Progress callback failed: {e}")

    def _should_retry(self, error: Exception, attempt: int) -> RetryAction:
        """Decide whether to retry a failed download attempt.

        Returns:
            RetryAction indicating whether to retry and whether to reset state.
        """
        if attempt >= self.max_retries:
            return RetryAction.NO_RETRY

        # HTTP status code checks
        if isinstance(error, httpx.HTTPStatusError):
            status_code = error.response.status_code

            # 416 Range Not Satisfiable: temp file may exceed server file,
            # need to delete and restart from scratch
            if status_code == 416:
                return RetryAction.RETRY_WITH_RESET

            # Non-retryable status codes
            if status_code in self.NO_RETRY_STATUS_CODES:
                return RetryAction.NO_RETRY

            # Other HTTP errors are retryable
            return RetryAction.RETRY

        # Network errors are retryable
        if isinstance(
            error,
            (
                httpx.ConnectError,
                httpx.ReadError,
                httpx.WriteError,
                httpx.TimeoutException,
                httpx.NetworkError,
            ),
        ):
            return RetryAction.RETRY

        # Check if Range header was ignored (server returned 200 instead of 206)
        if isinstance(error, DownloadError):
            error_msg = str(error)
            if "Server ignored Range header" in error_msg:
                # Need to delete temp file and restart from scratch
                return RetryAction.RETRY_WITH_RESET

        # Other errors are not retryable
        return RetryAction.NO_RETRY

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
