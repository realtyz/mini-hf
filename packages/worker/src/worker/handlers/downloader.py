"""Async HTTP file downloader with resume, cancellation, and progress reporting."""

import asyncio
import re
import shutil
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

    def __init__(self, message: str = "", successful_paths: list[str] | None = None):
        super().__init__(message)
        self.successful_paths = successful_paths or []


class DownloadPausedError(DownloaderError):
    """Download was paused by user request."""

    def __init__(self, message: str = "", successful_paths: list[str] | None = None):
        super().__init__(message)
        self.successful_paths = successful_paths or []


class DownloadError(DownloaderError):
    """Download failed (network error, checksum mismatch, etc.)."""

    def __init__(self, message: str = "", successful_paths: list[str] | None = None):
        super().__init__(message)
        self.successful_paths = successful_paths or []


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

    # HTTP status codes that should not be retried (client errors that won't resolve)
    NO_RETRY_STATUS_CODES = {400, 401, 403, 404, 405, 406, 410}

    # HTTP status codes that indicate transient server-side issues — retryable
    RETRY_STATUS_CODES = {429, 500, 502, 503, 504}

    # Regex to parse the IETF RateLimit response header (draft-ietf-httpapi-ratelimit-headers)
    # Format: "api";r=0;t=55  → resource_type="api", remaining=0, reset=55s
    _RATELIMIT_REGEX = re.compile(
        r'"(?P<resource_type>\w+)"\s*;\s*r\s*=\s*(?P<remaining>\d+)\s*;\s*t\s*=\s*(?P<reset>\d+)'
    )

    # Regex to parse the IETF RateLimit-Policy response header
    # Format: "fixed window";"api";q=500;w=300 → quota=500, window=300s
    _RATELIMIT_POLICY_REGEX = re.compile(
        r'q\s*=\s*(?P<quota>\d+).*?w\s*=\s*(?P<window>\d+)'
    )

    # Regex to parse Retry-After header value as seconds (integer form only)
    _RETRY_AFTER_REGEX = re.compile(r"^\s*(?P<seconds>\d+)\s*$")

    def __init__(
        self,
        temp_dir: str | Path,
        progress_callback: Callable[[ProgressInfo], None]
        | Callable[[ProgressInfo], Awaitable[None]]
        | None = None,
        progress_interval: float = 1.0,
        max_retries: int = 5,
        retry_base_delay: float = 1.0,
        retry_max_delay: float = 8.0,
        chunk_size: int = 8192,
        client: httpx.AsyncClient | None = None,
        head_check: bool = True,
        head_check_timeout: float = 10.0,
        disk_space_check: bool = True,
    ):
        self.temp_dir = Path(temp_dir)
        self.progress_callback = progress_callback
        self.progress_interval = progress_interval
        self.max_retries = max_retries
        self.retry_base_delay = retry_base_delay
        self.retry_max_delay = retry_max_delay
        self.chunk_size = chunk_size
        self.head_check = head_check
        self.head_check_timeout = head_check_timeout
        self.disk_space_check = disk_space_check

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
        if downloaded_size > 0 and "Range" not in request_headers:
            request_headers["Range"] = f"bytes={downloaded_size}-"

        # ---- disk space check ----
        if self.disk_space_check and expected_size is not None:
            self._check_disk_space(expected_size, self.temp_dir)

        # ---- HEAD pre-check ----
        if self.head_check:
            head_response = await self._do_head_check(url, request_headers)
            if head_response is not None:
                # Fail fast on non-retryable client errors
                if head_response.status_code in self.NO_RETRY_STATUS_CODES:
                    raise DownloadError(
                        f"HEAD check failed: HTTP {head_response.status_code} for {url}"
                    )
                # Update expected_size from the HEAD response (unaffected by
                # Content-Encoding compression on streaming GETs).
                head_cl = head_response.headers.get("Content-Length")
                if head_cl is not None:
                    try:
                        head_size = int(head_cl)
                        if head_size != expected_size:
                            logger.debug(
                                f"HEAD check: size corrected {expected_size} → "
                                f"{head_size} for {url}"
                            )
                            expected_size = head_size
                    except ValueError:
                        pass

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

                    # Check pause/cancel after the sleep — the user may
                    # have requested a pause while we were waiting.
                    self._check_paused(pause_event, url)

        # All retries exhausted
        raise DownloadError(
            f"Failed to download {url} after {self.max_retries + 1} attempts: {last_error}"
        ) from last_error

    # Exceptions that indicate transient network issues and should trigger
    # an immediate in-stream retry (without exponential backoff).
    _STREAM_RETRY_EXCEPTIONS = (
        httpx.ConnectError,
        httpx.ReadError,
        httpx.TimeoutException,
        httpx.NetworkError,
    )

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
        """Stream the file from URL and write to temp path, then rename to target.

        Transient network errors during streaming (ConnectError, ReadError,
        TimeoutException, NetworkError) trigger an immediate retry from the
        current byte position with a fixed short delay — the retry counter
        resets every time data flows successfully.  This avoids the full
        exponential-backoff path in the outer ``download()`` loop for brief
        network interruptions.
        """
        stream_retries_remaining = self.max_retries
        current_size = downloaded_size
        mode = "ab" if is_resumed else "wb"

        while True:
            try:
                async with self.client.stream(
                    "GET", url, headers=headers
                ) as response:
                    # Verify the server honored our Range request.
                    if is_resumed and response.status_code == 200:
                        raise DownloadError(
                            "Server ignored Range header, full content returned. "
                            "Need to restart from beginning."
                        )

                    if response.status_code in self.NO_RETRY_STATUS_CODES:
                        raise DownloadError(
                            f"HTTP {response.status_code} for {url}: "
                            f"{response.reason_phrase}"
                        )

                    # Retryable server-side status codes (429, 5xx) — retry
                    # at the connection level with server-specified wait time
                    # for rate-limit responses.
                    if response.status_code in self.RETRY_STATUS_CODES:
                        stream_retries_remaining -= 1
                        if stream_retries_remaining <= 0:
                            response.raise_for_status()
                            raise DownloadError(
                                f"Download failed after {self.max_retries} "
                                f"connection retries (HTTP {response.status_code}): {url}"
                            )

                        # 429 — honour the server's RateLimit reset hint
                        wait_time = 1.0
                        if response.status_code == 429:
                            ratelimit_wait = self._parse_ratelimit_headers(response)
                            if ratelimit_wait is not None:
                                wait_time = float(ratelimit_wait) + 1.0

                        logger.warning(
                            f"HTTP {response.status_code} for {url}, "
                            f"retrying in {wait_time:.0f}s "
                            f"({stream_retries_remaining} retries left)..."
                        )
                        await asyncio.sleep(wait_time)
                        # Recalculate position from temp file for resume
                        current_size = (
                            temp_file.stat().st_size if temp_file.exists() else 0
                        )
                        if current_size > 0 and "Range" not in headers:
                            headers["Range"] = f"bytes={current_size}-"
                        mode = "ab"
                        is_resumed = True
                        continue

                    response.raise_for_status()

                    total_size = self._get_total_size(response, current_size)
                    self._check_cancelled(cancel_event, url)

                    # Connection established — reset the stream retry counter
                    # so that intermittent failures don't accumulate.
                    stream_retries_remaining = self.max_retries

                    bytes_since_last_update = 0
                    last_update_time = time.monotonic()

                    async with aiofiles.open(temp_file, mode) as f:
                        async for chunk in response.aiter_bytes(
                            chunk_size=self.chunk_size
                        ):
                            self._check_cancelled(cancel_event, url)

                            await f.write(chunk)
                            current_size += len(chunk)

                            # Check pause after chunk is written to keep
                            # file consistent for potential resume.
                            self._check_paused(pause_event, url)

                            # Data is flowing — reset the retry counter so
                            # a slow-but-stable connection never exhausts
                            # retries.
                            stream_retries_remaining = self.max_retries

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

                    # ---- streaming completed normally ----
                    break

            except self._STREAM_RETRY_EXCEPTIONS as e:
                stream_retries_remaining -= 1
                if stream_retries_remaining <= 0:
                    raise DownloadError(
                        f"Download failed after {self.max_retries} in-stream "
                        f"retries: {url}"
                    ) from e

                # SSL / connection errors may be due to stale certificates
                # — recreate the internal client to pick up fresh state.
                if isinstance(e, httpx.ConnectError):
                    if self._client is not None:
                        logger.debug(
                            "ConnectError — recreating internal httpx client "
                            "to refresh SSL session"
                        )
                        await self._client.aclose()
                        self._client = httpx.AsyncClient(
                            follow_redirects=True,
                            timeout=30.0,
                        )

                # Recalculate current_size from the temp file in case the
                # error occurred before any chunks were written this iteration.
                current_size = (
                    temp_file.stat().st_size if temp_file.exists() else 0
                )

                logger.warning(
                    f"Stream interrupted for {url}: {e}. "
                    f"Resuming from byte {current_size} "
                    f"({stream_retries_remaining} retries left)..."
                )

                # Prepare headers for resume on the next loop iteration.
                if current_size > 0 and "Range" not in headers:
                    headers["Range"] = f"bytes={current_size}-"
                mode = "ab"
                is_resumed = True
                await asyncio.sleep(1.0)
                # loop continues

        # ---- post-stream: verification and finalization ----

        # Verify downloaded size matches expected
        if expected_size is not None and current_size != expected_size:
            raise DownloadError(
                f"Size mismatch for {target_path}: "
                f"expected {expected_size}, got {current_size}"
            )

        # Final progress report (stream completed)
        await self._report_progress(
            url=url,
            target_path=target_path,
            downloaded=current_size,
            total=total_size,
            speed=0.0,
            is_resumed=is_resumed,
        )

        # Atomic rename from temp to target
        target_path.parent.mkdir(parents=True, exist_ok=True)
        temp_file.rename(target_path)
        logger.info(f"Downloaded: {target_path}")

        return target_path

    def _get_temp_path(self, target_path: Path) -> Path:
        """Return the .incomplete temp path for the given target file."""
        return target_path.with_suffix(target_path.suffix + ".incomplete")

    @staticmethod
    def _check_disk_space(expected_size: int, target_dir: Path) -> None:
        """Check that enough free disk space is available before downloading.

        Walks *target_dir* and its parents until a readable path is found,
        then logs a warning if free space is less than *expected_size*.
        """
        for path in [target_dir] + list(target_dir.parents):
            try:
                free = shutil.disk_usage(path).free
                if free < expected_size:
                    logger.warning(
                        f"Low disk space: need {expected_size / 1e6:.1f} MB, "
                        f"but {target_dir} has only {free / 1e6:.1f} MB free"
                    )
                return
            except OSError:
                pass  # path doesn't exist or can't be queried; try parent

    def _parse_ratelimit_headers(self, response: httpx.Response) -> int | None:
        """Extract the rate-limit reset time (seconds) from a 429 response.

        Supports three mechanisms, checked in order of priority:

        1. IETF ``RateLimit`` header (draft-ietf-httpapi-ratelimit-headers)::

               RateLimit: "api";r=0;t=55  → returns 55

        2. IETF ``RateLimit-Policy`` header (for informational logging)::

               RateLimit-Policy: "fixed window";"api";q=500;w=300

        3. Standard ``Retry-After`` header as a fallback::

               Retry-After: 120

        Header keys are matched case-insensitively.

        Returns:
            Reset time in seconds, or ``None`` if no rate-limit header is found
            or parseable.
        """
        ratelimit_value: str | None = None
        policy_value: str | None = None
        retry_after: str | None = None

        # Collect values via case-insensitive header scan
        for key in response.headers:
            lower = key.lower()
            if lower == "ratelimit":
                ratelimit_value = response.headers[key]
            elif lower == "ratelimit-policy":
                policy_value = response.headers[key]
            elif lower == "retry-after":
                retry_after = response.headers[key]

        # ---- primary: IETF RateLimit header ----
        if ratelimit_value:
            match = self._RATELIMIT_REGEX.search(ratelimit_value)
            if match:
                reset = int(match.group("reset"))
                remaining = int(match.group("remaining"))
                resource = match.group("resource_type")

                # Parse optional RateLimit-Policy for quota / window metadata
                quota: int | None = None
                window: int | None = None
                if policy_value:
                    policy_match = self._RATELIMIT_POLICY_REGEX.search(policy_value)
                    if policy_match:
                        quota = int(policy_match.group("quota"))
                        window = int(policy_match.group("window"))

                logger.debug(
                    f"RateLimit parsed: resource={resource}, "
                    f"remaining={remaining}/{quota or '?'}, "
                    f"reset={reset}s, window={window or '?'}s"
                )
                return reset

        # ---- fallback: Retry-After header ----
        if retry_after:
            match = self._RETRY_AFTER_REGEX.search(retry_after)
            if match:
                seconds = int(match.group("seconds"))
                logger.debug(
                    f"Retry-After parsed: {seconds}s (from Retry-After: {retry_after})"
                )
                return seconds

        return None

    async def _do_head_check(
        self,
        url: str,
        headers: dict[str, str] | None,
    ) -> httpx.Response | None:
        """Send a HEAD request to validate URL reachability and fetch metadata.

        Returns:
            The HEAD ``httpx.Response`` on success, or ``None`` if the HEAD
            request itself failed (connection timeout, etc.) — the caller should
            fall back to a direct GET in that case.
        """
        try:
            # Force identity encoding so Content-Length reflects actual file
            # size, not the compressed transfer size.
            head_headers = dict(headers) if headers else {}
            head_headers["Accept-Encoding"] = "identity"
            return await self.client.head(
                url,
                headers=head_headers,
                timeout=self.head_check_timeout,
            )
        except Exception:
            logger.debug(
                f"HEAD check failed for {url}, falling back to direct GET"
            )
            return None

    def _get_total_size(
        self, response: httpx.Response, downloaded_size: int
    ) -> int | None:
        """Extract total file size from response headers.

        If the response body is compressed (e.g. gzip), the ``Content-Length`` header
        reflects the compressed size, not the actual file size. Since we cannot know
        the uncompressed size at the start of transmission, return ``None`` so the
        progress bar shows indeterminate progress.
        """
        content_encoding = response.headers.get("Content-Encoding", "identity").lower()
        if content_encoding != "identity":
            return None

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

            # Rate limiting — always retry (server tells us when)
            if status_code == 429:
                return RetryAction.RETRY

            # Transient server errors — retryable
            if status_code in self.RETRY_STATUS_CODES:
                return RetryAction.RETRY

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
