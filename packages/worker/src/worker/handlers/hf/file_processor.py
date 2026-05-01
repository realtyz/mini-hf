"""File download and upload processing."""

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from services.huggingface import hf_url
from huggingface_hub import RepoFile
import httpx
from loguru import logger

from core import settings
from worker.handlers._downloader import (
    HttpFileDownloader,
    ProgressInfo,
    DownloadCancelledError,
    DownloadError,
    DownloadPausedError,
)
from worker.services import TaskProgressTracker
from storage import S3Client, s3_client, build_blob_key


@dataclass
class FileProcessResult:
    """Result of processing a single file (download + upload)."""

    status: Literal["uploaded", "exists"]
    path: str
    blob_id: str
    size: int


@dataclass
class FileProcessInfrastructure:
    """Concurrency controls and shared clients for file processing.

    Separated from business data so FileProcessContext focuses on
    repo-level parameters and control signals.
    """

    download_semaphore: asyncio.Semaphore
    upload_semaphore: asyncio.Semaphore
    check_semaphore: asyncio.Semaphore
    shared_client: httpx.AsyncClient | None = None
    s3: S3Client = None  # type: ignore[assignment]


@dataclass
class FileProcessContext:
    """Business data and control signals for file download/upload."""

    repo_id: str
    repo_type: str
    commit_hash: str
    access_token: str | None
    cancel_event: asyncio.Event
    pause_event: asyncio.Event
    progress_tracker: TaskProgressTracker | None
    endpoint: str
    infra: FileProcessInfrastructure
    skip_s3_check_paths: set[str] = None  # type: ignore[assignment]


async def download_and_upload_files(
    ctx: FileProcessContext,
    files: list[RepoFile],
) -> list[FileProcessResult]:
    """Download files concurrently to local temp directory and upload to S3.

    This function performs pure IO (download + upload) and returns the list of
    successful results. Database updates are the caller's responsibility.

    Args:
        ctx: Shared context with repo info, semaphores, and control events.
        files: List of RepoFile objects to download.

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
            timeout=30.0,
            limits=httpx.Limits(
                max_connections=settings.WORKER_CONCURRENT_DOWNLOADS
                + settings.WORKER_CONCURRENT_UPLOADS
                + 2,
                max_keepalive_connections=settings.WORKER_CONCURRENT_DOWNLOADS + 2,
            ),
        )

    # Step 1: Initialize all files' progress to pending
    if ctx.progress_tracker:
        logger.debug("Initializing progress for {} files...", len(files))
        await ctx.progress_tracker.batch_start_files([(f.path, f.size) for f in files])
        logger.debug("Progress initialization completed for {} files", len(files))

    # Step 2: Create all download+upload tasks (pure IO, no database)
    logger.debug("Creating {} download tasks...", len(files))
    download_tasks = [_process_single_file(ctx, repo_file) for repo_file in files]

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

    # Step 2: Categorize results
    successful_results: list[FileProcessResult] = []
    failures: list[tuple[str, Exception]] = []
    paused_count = 0

    for repo_file, result in zip(files, results):
        if isinstance(result, DownloadPausedError):
            paused_count += 1
            logger.debug("File {} paused before starting", repo_file.path)
        elif isinstance(result, DownloadCancelledError):
            logger.info("Download cancelled for {}: {}", repo_file.path, result)
            raise result
        elif isinstance(result, Exception):
            failures.append((repo_file.path, result))
            logger.error("Failed to process {}: {}", repo_file.path, result)
            # Mark file as failed
            if ctx.progress_tracker:
                await ctx.progress_tracker.fail_file(repo_file.path, str(result))
        elif isinstance(result, FileProcessResult):
            successful_results.append(result)
        else:
            logger.error(
                "Unexpected result type for {}: {}", repo_file.path, type(result)
            )

    logger.info(
        "  -> Downloaded and uploaded {}/{} files successfully ({} paused)",
        len(successful_results),
        len(files),
        paused_count,
    )

    # Step 3: Handle failures or pause
    if failures:
        failed_paths = [f[0] for f in failures]
        raise DownloadError(
            f"Failed to process {len(failures)} files: {', '.join(failed_paths[:3])}"
            f"{'...' if len(failures) > 3 else ''}"
        )

    if paused_count > 0:
        raise DownloadPausedError(
            f"Paused after processing {len(successful_results)} files, "
            f"{paused_count} files remaining"
        )

    return successful_results


async def _process_single_file(
    ctx: FileProcessContext,
    repo_file: RepoFile,
) -> FileProcessResult:
    """Process a single file: download from HF and upload to S3.

    Uses independent semaphores for download and upload so other files
    can download while this one uploads.
    """
    blob_id = (
        repo_file.lfs.sha256
        if repo_file.lfs is not None and repo_file.lfs.sha256
        else repo_file.blob_id
    )
    if not blob_id:
        raise DownloadError(f"Missing blob_id for {repo_file.path}")

    s3_key = build_blob_key(ctx.repo_id, ctx.repo_type, blob_id)

    # Check if already in S3 (throttled).
    # Skip for new-download files where the blob is almost certainly absent;
    # the upload-phase check still guards against duplicate uploads.
    skip_paths = ctx.skip_s3_check_paths or set()
    if repo_file.path not in skip_paths:
        async with ctx.infra.check_semaphore:
            if await ctx.infra.s3.file_exists(s3_key):
                if ctx.progress_tracker:
                    await ctx.progress_tracker.complete_file(repo_file.path)
                return FileProcessResult(
                    status="exists",
                    path=repo_file.path,
                    blob_id=blob_id,
                    size=repo_file.size,
                )

    # Empty files: skip download, upload a zero-byte object
    if repo_file.size == 0:
        return await _process_empty_file(ctx, repo_file, blob_id, s3_key)

    # Download phase
    target_path = await _download_phase(ctx, repo_file)

    # Upload phase
    return await _upload_phase(ctx, repo_file, blob_id, s3_key, target_path)


# ---------------------------------------------------------------------------
# Helper functions for _process_single_file
# ---------------------------------------------------------------------------


async def _process_empty_file(
    ctx: FileProcessContext,
    repo_file: RepoFile,
    blob_id: str,
    s3_key: str,
) -> FileProcessResult:
    """Create a local empty file and upload it to S3."""
    if ctx.progress_tracker:
        await ctx.progress_tracker.mark_file_downloading(repo_file.path)

    repo_dir = ctx.repo_id.replace("/", "--")
    target_path = Path(settings.INCOMPLETE_FILE_PATH) / repo_dir / repo_file.path
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.touch()

    if ctx.progress_tracker:
        await ctx.progress_tracker.complete_file(repo_file.path)

    async with ctx.infra.upload_semaphore:
        if await ctx.infra.s3.file_exists(s3_key):
            _cleanup_temp_file(target_path)
            return FileProcessResult(
                status="exists",
                path=repo_file.path,
                blob_id=blob_id,
                size=0,
            )

        try:
            if ctx.progress_tracker:
                await ctx.progress_tracker.start_file_upload(repo_file.path, 0)

            await ctx.infra.s3.upload_file_from_path(
                key=s3_key,
                file_path=str(target_path),
                metadata={
                    "repo_id": ctx.repo_id,
                    "blob_id": blob_id,
                    "size": "0",
                    "source_path": repo_file.path,
                },
            )

            if ctx.progress_tracker:
                await ctx.progress_tracker.complete_file_upload(repo_file.path)

            logger.debug(
                "Uploaded empty file to S3: {} ({})", repo_file.path, blob_id[:12]
            )
        except Exception as e:
            if ctx.progress_tracker:
                await ctx.progress_tracker.fail_file_upload(repo_file.path, str(e))
            raise
        finally:
            _cleanup_temp_file(target_path)

    return FileProcessResult(
        status="uploaded",
        path=repo_file.path,
        blob_id=blob_id,
        size=0,
    )


async def _download_phase(
    ctx: FileProcessContext,
    repo_file: RepoFile,
) -> Path:
    """Download a file from HF Hub, returning the local path.

    Holds the download semaphore during the entire download.
    Pause is checked before starting; cancellation is checked during download.
    """
    async with ctx.infra.download_semaphore:
        if ctx.pause_event.is_set():
            raise DownloadPausedError

        if ctx.progress_tracker:
            await ctx.progress_tracker.mark_file_downloading(repo_file.path)

        repo_dir = ctx.repo_id.replace("/", "--")
        target_path = Path(settings.INCOMPLETE_FILE_PATH) / repo_dir / repo_file.path
        target_path.parent.mkdir(parents=True, exist_ok=True)

        async def progress_callback(info: ProgressInfo) -> None:
            if ctx.progress_tracker:
                try:
                    await ctx.progress_tracker.update_file_progress(
                        file_path=repo_file.path,
                        downloaded=info.downloaded_bytes,
                        total=info.total_bytes or repo_file.size,
                        speed=info.speed_bytes_per_sec,
                    )
                except Exception as e:
                    logger.debug("Failed to update progress: {}", e)

        async with HttpFileDownloader(
            temp_dir=settings.INCOMPLETE_FILE_PATH,
            progress_callback=progress_callback,
            progress_interval=settings.WORKER_PROGRESS_INTERVAL,
            client=ctx.infra.shared_client,
        ) as downloader:
            url = hf_url(
                repo_id=ctx.repo_id,
                filename=repo_file.path,
                repo_type=ctx.repo_type,
                revision=ctx.commit_hash,
                endpoint=ctx.endpoint,
            )
            headers = (
                {"Authorization": f"Bearer {ctx.access_token}"}
                if ctx.access_token
                else None
            )

            logger.debug("Downloading: {} -> {}", repo_file.path, target_path)

            try:
                downloaded_path = await downloader.download(
                    url=url,
                    target_path=target_path,
                    expected_size=repo_file.size,
                    headers=headers,
                    cancel_event=ctx.cancel_event,
                    pause_event=ctx.pause_event,
                )
                if ctx.progress_tracker:
                    await ctx.progress_tracker.complete_file(repo_file.path)
                return downloaded_path

            except DownloadCancelledError:
                logger.info("Download cancelled for {}", repo_file.path)
                raise
            except Exception as e:
                logger.error("Download failed for {}: {}", repo_file.path, e)
                if ctx.progress_tracker:
                    await ctx.progress_tracker.fail_file(repo_file.path, str(e))
                raise


async def _upload_phase(
    ctx: FileProcessContext,
    repo_file: RepoFile,
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
                path=repo_file.path,
                blob_id=blob_id,
                size=repo_file.size,
            )

        try:
            if ctx.progress_tracker:
                await ctx.progress_tracker.start_file_upload(
                    repo_file.path, repo_file.size
                )

            result = await ctx.infra.s3.upload_file_from_path(
                key=s3_key,
                file_path=str(downloaded_path),
                metadata={
                    "repo_id": ctx.repo_id,
                    "blob_id": blob_id,
                    "size": str(repo_file.size),
                    "source_path": repo_file.path,
                },
            )

            if ctx.progress_tracker:
                await ctx.progress_tracker.complete_file_upload(repo_file.path)

            logger.debug(
                "Uploaded to S3: {} (blob: {}, etag: {}, size: {})",
                repo_file.path,
                blob_id[:12],
                result["etag"],
                result["size"],
            )
        except Exception as e:
            if ctx.progress_tracker:
                await ctx.progress_tracker.fail_file_upload(repo_file.path, str(e))
            raise
        finally:
            _cleanup_temp_file(downloaded_path)

    return FileProcessResult(
        status="uploaded",
        path=repo_file.path,
        blob_id=blob_id,
        size=repo_file.size,
    )


def _cleanup_temp_file(path: Path) -> None:
    """Remove a temp file, swallowing any OSError."""
    try:
        path.unlink(missing_ok=True)
    except OSError as e:
        logger.warning("Failed to clean up temp file {}: {}", path, e)
