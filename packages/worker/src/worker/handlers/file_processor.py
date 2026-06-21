"""File download and upload processing."""

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from urllib.parse import quote

import httpx
from loguru import logger

from core import settings
from storage import S3Client, s3_client, build_blob_key
from worker.handlers.downloader import (
    DownloadCancelledError,
    DownloadError,
    DownloadPausedError,
    HttpFileDownloader,
    ProgressInfo,
)
from worker.handlers.source_types import AuthHeaderBuilder, SourceFile, UrlBuilder
from worker.handlers.progress_tracker import TaskProgressTracker

_HTTPX_CONNECTION_HEADROOM = 2


@dataclass
class FileProcessResult:
    """Result of processing a single file (download + upload)."""

    status: Literal["uploaded", "exists"]
    path: str
    blob_id: str
    size: int


@dataclass
class FileProcessInfrastructure:
    """Concurrency controls, signals, and shared clients for file processing.

    Separated from business data so FileProcessContext focuses on
    repo-level parameters and callable builders.
    """

    download_semaphore: asyncio.Semaphore
    upload_semaphore: asyncio.Semaphore
    check_semaphore: asyncio.Semaphore
    cancel_event: asyncio.Event
    pause_event: asyncio.Event
    shared_client: httpx.AsyncClient | None = None
    s3: S3Client = None  # type: ignore[assignment]


@dataclass
class FileProcessContext:
    """Business data and callable builders for file download/upload."""

    repo_id: str
    repo_type: str
    commit_hash: str
    access_token: str | None
    progress_tracker: TaskProgressTracker | None
    url_builder: UrlBuilder
    auth_header_builder: AuthHeaderBuilder
    infra: FileProcessInfrastructure


async def download_and_upload_files(
    ctx: FileProcessContext,
    files: list[SourceFile],
) -> list[FileProcessResult]:
    """Download files concurrently to local temp directory and upload to S3.

    This function performs pure IO (download + upload) and returns the list of
    successful results. Database updates are the caller's responsibility.

    Args:
        ctx: Shared context with repo info, semaphores, and control events.
        files: List of SourceFile objects to download.

    Returns:
        List of FileProcessResult for successfully processed files.

    Raises:
        DownloadError: If any files fail to process
        DownloadPausedError: If pause was requested and no real failures occurred
    """
    # Step 0: Initialize defaults
    if ctx.infra.s3 is None:
        ctx.infra.s3 = s3_client

    # Create a shared AsyncClient for connection reuse across all downloads
    if ctx.infra.shared_client is None:
        ctx.infra.shared_client = httpx.AsyncClient(
            follow_redirects=True,
            timeout=httpx.Timeout(
                connect=10.0,
                read=settings.WORKER_DOWNLOAD_READ_TIMEOUT,
                write=10.0,
                pool=10.0,
            ),
            limits=httpx.Limits(
                max_connections=settings.WORKER_CONCURRENT_DOWNLOADS
                + settings.WORKER_CONCURRENT_UPLOADS
                + _HTTPX_CONNECTION_HEADROOM,
                max_keepalive_connections=settings.WORKER_CONCURRENT_DOWNLOADS
                + _HTTPX_CONNECTION_HEADROOM,
            ),
        )

    # Step 1: Initialize all files' progress to pending
    if ctx.progress_tracker:
        logger.debug("Initializing progress for {} files...", len(files))
        await ctx.progress_tracker.batch_start_files([(f.path, f.size) for f in files])
        logger.debug("Progress initialization completed for {} files", len(files))

    # Step 2: Create all download+upload tasks (pure IO, no database)
    logger.debug("Creating {} download tasks...", len(files))
    download_tasks = [_process_single_file(ctx, f) for f in files]

    # Wait for all tasks to complete, collect results
    try:
        logger.debug(
            "Waiting for {} download tasks to complete...", len(download_tasks)
        )
        results = await asyncio.gather(*download_tasks, return_exceptions=True)
        logger.debug("All download tasks completed, processing results...")
    finally:
        if ctx.infra.shared_client is not None:
            await ctx.infra.shared_client.aclose()

    # Step 2: Categorize results — collect ALL results before deciding to raise,
    # so successful files that happen to appear after a cancelled/failed file in
    # the zip order are not lost.
    successful_results: list[FileProcessResult] = []
    failures: list[tuple[str, Exception]] = []
    paused_count = 0
    cancelled_error: DownloadCancelledError | None = None

    for src_file, result in zip(files, results):
        if isinstance(result, DownloadPausedError):
            paused_count += 1
            logger.debug("File {} paused before starting", src_file.path)
        elif isinstance(result, DownloadCancelledError):
            if cancelled_error is None:
                cancelled_error = result
            logger.info("Download cancelled for {}: {}", src_file.path, result)
            if ctx.progress_tracker:
                await ctx.progress_tracker.fail_file(src_file.path, str(result))
        elif isinstance(result, Exception):
            failures.append((src_file.path, result))
            logger.error("Failed to process {}: {}", src_file.path, result)
            if ctx.progress_tracker:
                await ctx.progress_tracker.fail_file(src_file.path, str(result))
        elif isinstance(result, FileProcessResult):
            successful_results.append(result)
        else:
            logger.error(
                "Unexpected result type for {}: {}", src_file.path, type(result)
            )

    logger.info(
        "  -> Downloaded and uploaded {}/{} files successfully ({} paused, {} cancelled)",
        len(successful_results),
        len(files),
        paused_count,
        1 if cancelled_error else 0,
    )

    # Step 3: Raise with complete successful_paths (order-independent)
    successful_paths = [r.path for r in successful_results]

    if cancelled_error is not None:
        cancelled_error.successful_paths = successful_paths
        raise cancelled_error

    if failures:
        failed_paths = [f[0] for f in failures]
        raise DownloadError(
            f"Failed to process {len(failures)} files: {', '.join(failed_paths[:3])}"
            f"{'...' if len(failures) > 3 else ''}",
            successful_paths=successful_paths,
        )

    if paused_count > 0:
        raise DownloadPausedError(
            f"Paused after processing {len(successful_results)} files, "
            f"{paused_count} files remaining",
            successful_paths=successful_paths,
        )

    return successful_results


async def _process_single_file(
    ctx: FileProcessContext,
    src_file: SourceFile,
) -> FileProcessResult:
    """Process a single file: download from source and upload to S3.

    Uses independent semaphores for download and upload so other files
    can download while this one uploads.
    """
    blob_id = src_file.blob_id
    if not blob_id:
        raise DownloadError(f"Missing blob_id for {src_file.path}")

    s3_key = build_blob_key(ctx.repo_id, ctx.repo_type, blob_id)

    # Check if already in S3 (throttled).
    async with ctx.infra.check_semaphore:
        if await ctx.infra.s3.file_exists(s3_key):
            if ctx.progress_tracker:
                await ctx.progress_tracker.complete_file(src_file.path, src_file.size)
            return FileProcessResult(
                status="exists",
                path=src_file.path,
                blob_id=blob_id,
                size=src_file.size,
            )

    # Empty files: skip download, upload a zero-byte object
    if src_file.size == 0:
        return await _process_empty_file(ctx, src_file, blob_id, s3_key)

    # Download phase
    target_path = await _download_phase(ctx, src_file)

    # Upload phase
    return await _upload_phase(ctx, src_file, blob_id, s3_key, target_path)


# ---------------------------------------------------------------------------
# Helper functions for _process_single_file
# ---------------------------------------------------------------------------


async def _process_empty_file(
    ctx: FileProcessContext,
    src_file: SourceFile,
    blob_id: str,
    s3_key: str,
) -> FileProcessResult:
    """Create a local empty file and upload it to S3."""
    if ctx.progress_tracker:
        await ctx.progress_tracker.mark_file_downloading(src_file.path)

    repo_dir = ctx.repo_id.replace("/", "--")
    target_path = Path(settings.INCOMPLETE_FILE_PATH) / repo_dir / src_file.path
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.touch()

    if ctx.progress_tracker:
        await ctx.progress_tracker.complete_file(src_file.path, 0)

    async with ctx.infra.upload_semaphore:
        if await ctx.infra.s3.file_exists(s3_key):
            _cleanup_temp_file(target_path)
            return FileProcessResult(
                status="exists",
                path=src_file.path,
                blob_id=blob_id,
                size=0,
            )

        try:
            if ctx.progress_tracker:
                await ctx.progress_tracker.start_file_upload(src_file.path, 0)

            await ctx.infra.s3.upload_file_from_path(
                key=s3_key,
                file_path=str(target_path),
                metadata={
                    "repo_id": ctx.repo_id,
                    "blob_id": blob_id,
                    "size": "0",
                    "source_path": quote(src_file.path, safe="/"),
                },
            )

            if ctx.progress_tracker:
                await ctx.progress_tracker.complete_file_upload(src_file.path, 0)

            logger.debug(
                "Uploaded empty file to S3: {} ({})", src_file.path, blob_id[:12]
            )
        except Exception as e:
            if ctx.progress_tracker:
                await ctx.progress_tracker.fail_file_upload(src_file.path, str(e))
            raise
        finally:
            _cleanup_temp_file(target_path)

    return FileProcessResult(
        status="uploaded",
        path=src_file.path,
        blob_id=blob_id,
        size=0,
    )


async def _download_phase(
    ctx: FileProcessContext,
    src_file: SourceFile,
) -> Path:
    """Download a file from source, returning the local path.

    Holds the download semaphore during the entire download.
    Pause is checked before starting; cancellation is checked during download.
    """
    async with ctx.infra.download_semaphore:
        if ctx.infra.pause_event.is_set():
            raise DownloadPausedError

        if ctx.progress_tracker:
            await ctx.progress_tracker.mark_file_downloading(src_file.path)

        repo_dir = ctx.repo_id.replace("/", "--")
        target_path = Path(settings.INCOMPLETE_FILE_PATH) / repo_dir / src_file.path
        target_path.parent.mkdir(parents=True, exist_ok=True)

        async def progress_callback(info: ProgressInfo) -> None:
            if ctx.progress_tracker:
                try:
                    status = (
                        "reconnecting"
                        if info.phase == "reconnecting"
                        else "downloading"
                    )
                    await ctx.progress_tracker.update_file_progress(
                        file_path=src_file.path,
                        downloaded=info.downloaded_bytes,
                        total=info.total_bytes or src_file.size,
                        speed=info.speed_bytes_per_sec,
                        status=status,
                    )
                except Exception as e:
                    logger.debug("Failed to update progress: {}", e)

        async with HttpFileDownloader(
            temp_dir=settings.INCOMPLETE_FILE_PATH,
            progress_callback=progress_callback,
            progress_interval=settings.WORKER_PROGRESS_INTERVAL,
            max_retries=settings.WORKER_MAX_RETRIES,
            retry_base_delay=settings.WORKER_RETRY_BASE_DELAY,
            retry_max_delay=settings.WORKER_RETRY_MAX_DELAY,
            chunk_size=settings.WORKER_DOWNLOAD_CHUNK_SIZE,
            client=ctx.infra.shared_client,
            head_check=settings.WORKER_HEAD_CHECK_ENABLED,
            head_check_timeout=settings.WORKER_HEAD_CHECK_TIMEOUT,
            disk_space_check=settings.WORKER_DISK_SPACE_CHECK_ENABLED,
            stall_report_threshold=settings.WORKER_STALL_REPORT_THRESHOLD,
        ) as downloader:
            url = ctx.url_builder(
                repo_id=ctx.repo_id,
                repo_type=ctx.repo_type,
                revision=ctx.commit_hash,
                file_path=src_file.path,
            )
            headers = ctx.auth_header_builder(ctx.access_token)

            logger.debug("Downloading: {} -> {}", src_file.path, target_path)

            try:
                downloaded_path = await downloader.download(
                    url=url,
                    target_path=target_path,
                    expected_size=src_file.size,
                    headers=headers,
                    cancel_event=ctx.infra.cancel_event,
                    pause_event=ctx.infra.pause_event,
                )
                if ctx.progress_tracker:
                    await ctx.progress_tracker.complete_file(
                        src_file.path, src_file.size
                    )
                return downloaded_path

            except DownloadCancelledError:
                logger.info("Download cancelled for {}", src_file.path)
                raise
            except Exception as e:
                logger.error("Download failed for {}: {}", src_file.path, e)
                if ctx.progress_tracker:
                    await ctx.progress_tracker.fail_file(src_file.path, str(e))
                raise


async def _upload_phase(
    ctx: FileProcessContext,
    src_file: SourceFile,
    blob_id: str,
    s3_key: str,
    downloaded_path: Path,
) -> FileProcessResult:
    """Upload a downloaded file to S3, returning the result.

    Holds the upload semaphore during the upload.
    Handles race conditions where another task uploaded the same blob first.
    """
    async with ctx.infra.upload_semaphore:
        # Another task may have uploaded the same blob while we waited
        if await ctx.infra.s3.file_exists(s3_key):
            _cleanup_temp_file(downloaded_path)
            return FileProcessResult(
                status="exists",
                path=src_file.path,
                blob_id=blob_id,
                size=src_file.size,
            )

        try:
            if ctx.progress_tracker:
                await ctx.progress_tracker.start_file_upload(
                    src_file.path, src_file.size
                )

            result = await ctx.infra.s3.upload_file_from_path(
                key=s3_key,
                file_path=str(downloaded_path),
                metadata={
                    "repo_id": ctx.repo_id,
                    "blob_id": blob_id,
                    "size": str(src_file.size),
                    "source_path": quote(src_file.path, safe="/"),
                },
            )

            if ctx.progress_tracker:
                await ctx.progress_tracker.complete_file_upload(
                    src_file.path, src_file.size
                )

            logger.debug(
                "Uploaded to S3: {} (blob: {}, etag: {}, size: {})",
                src_file.path,
                blob_id[:12],
                result["etag"],
                result["size"],
            )
        except Exception as e:
            if ctx.progress_tracker:
                await ctx.progress_tracker.fail_file_upload(src_file.path, str(e))
            raise
        finally:
            _cleanup_temp_file(downloaded_path)

    return FileProcessResult(
        status="uploaded",
        path=src_file.path,
        blob_id=blob_id,
        size=src_file.size,
    )


def _cleanup_temp_file(path: Path) -> None:
    """Remove a temp file, swallowing any OSError."""
    try:
        path.unlink(missing_ok=True)
    except OSError as e:
        logger.warning("Failed to clean up temp file {}: {}", path, e)
