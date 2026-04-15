"""File download and upload processing."""

import asyncio
from pathlib import Path

from services.huggingface import hf_url
from huggingface_hub import RepoFile
import httpx
from loguru import logger

from core import settings
from worker.handlers._downloader import (
    HttpFileDownloader,
    ProgressInfo,
    DownloadError,
)
from worker.services import TaskProgressTracker
from storage import s3_client, build_blob_key


# Default concurrent download count
DEFAULT_CONCURRENT_DOWNLOADS = 3

# Default concurrent upload count (can be higher than download as uploads are usually faster)
DEFAULT_CONCURRENT_UPLOADS = 3

# Default concurrent S3 existence checks
DEFAULT_CONCURRENT_CHECKS = 5

# Progress reporting interval (seconds)
PROGRESS_INTERVAL = 2.0


async def download_and_upload_files(
    repo_id: str,
    repo_type: str,
    commit_hash: str,
    files: list[RepoFile],
    access_token: str | None,
    cancel_event: asyncio.Event,
    progress_tracker: TaskProgressTracker | None = None,
    endpoint: str | None = None,
) -> list[dict]:
    """Download files concurrently to local temp directory and upload to S3.

    This function performs pure IO (download + upload) and returns the list of
    successful results. Database updates are the caller's responsibility.

    Args:
        repo_id: Repository ID
        repo_type: Repository type
        commit_hash: Commit hash (used for constructing download URLs)
        files: List of RepoFile objects to download
        access_token: Optional access token for authentication
        cancel_event: Event to signal cancellation
        progress_tracker: Optional progress tracker
        endpoint: Optional HF endpoint URL to use for downloads

    Returns:
        List of result dicts for successfully processed files. Each dict has:
        - status: "uploaded" | "exists"
        - path: File path
        - blob_id: Blob ID
        - size: File size

    Raises:
        DownloadError: If any files fail to process
    """
    if endpoint is None:
        endpoint = "https://huggingface.co"

    # Step 0: Create a shared AsyncClient for connection reuse across all downloads
    shared_client = httpx.AsyncClient(
        follow_redirects=True,
        timeout=30.0,
        limits=httpx.Limits(
            max_connections=DEFAULT_CONCURRENT_DOWNLOADS + DEFAULT_CONCURRENT_UPLOADS + 2,
            max_keepalive_connections=DEFAULT_CONCURRENT_DOWNLOADS + 2,
        ),
    )

    # Use separate semaphores for download and upload concurrency
    # Download semaphore is released after download completes, allowing other tasks to start
    # Upload uses separate semaphore, allowing download and upload to run in parallel
    download_semaphore = asyncio.Semaphore(DEFAULT_CONCURRENT_DOWNLOADS)
    upload_semaphore = asyncio.Semaphore(DEFAULT_CONCURRENT_UPLOADS)
    # Semaphore for S3 existence checks (runs before download/upload, can overwhelm S3 if unbounded)
    check_semaphore = asyncio.Semaphore(DEFAULT_CONCURRENT_CHECKS)

    # Step 1: Initialize all files' progress to pending
    if progress_tracker:
        logger.debug("Initializing progress for {} files...", len(files))
        await progress_tracker.batch_start_files([(f.path, f.size) for f in files])
        logger.debug("Progress initialization completed for {} files", len(files))

    # Step 2: Create all download+upload tasks (pure IO, no database)
    logger.debug("Creating {} download tasks...", len(files))
    download_tasks = [
        _process_single_file(
            download_semaphore=download_semaphore,
            upload_semaphore=upload_semaphore,
            check_semaphore=check_semaphore,
            repo_id=repo_id,
            repo_type=repo_type,
            commit_hash=commit_hash,
            repo_file=repo_file,
            access_token=access_token,
            cancel_event=cancel_event,
            progress_tracker=progress_tracker,
            endpoint=endpoint,
            shared_client=shared_client,
        )
        for repo_file in files
    ]

    # Wait for all tasks to complete, collect results
    try:
        logger.debug("Waiting for {} download tasks to complete...", len(download_tasks))
        results = await asyncio.gather(*download_tasks, return_exceptions=True)
        logger.debug("All download tasks completed, processing results...")
    finally:
        await shared_client.aclose()

    # Step 2: Categorize results
    successful_results: list[dict] = []
    failures: list[tuple[str, Exception]] = []

    for repo_file, result in zip(files, results):
        if isinstance(result, Exception):
            failures.append((repo_file.path, result))
            logger.error("Failed to process {}: {}", repo_file.path, result)
            # Mark file as failed
            if progress_tracker:
                await progress_tracker.fail_file(repo_file.path, str(result))
        elif isinstance(result, dict):
            # result is a dict with status, path, blob_id, size
            successful_results.append(result)
        else:
            logger.error(
                "Unexpected result type for {}: {}", repo_file.path, type(result)
            )

    logger.info(
        "  -> Downloaded and uploaded {}/{} files successfully",
        len(successful_results),
        len(files),
    )

    # Step 3: If there are failures, raise exception
    if failures:
        failed_paths = [f[0] for f in failures]
        raise DownloadError(
            f"Failed to process {len(failures)} files: {', '.join(failed_paths[:3])}"
            f"{'...' if len(failures) > 3 else ''}"
        )

    return successful_results


async def _process_single_file(
    download_semaphore: asyncio.Semaphore,
    upload_semaphore: asyncio.Semaphore,
    check_semaphore: asyncio.Semaphore,
    repo_id: str,
    repo_type: str,
    commit_hash: str,
    repo_file: RepoFile,
    access_token: str | None,
    cancel_event: asyncio.Event,
    progress_tracker: TaskProgressTracker | None = None,
    endpoint: str | None = None,
    shared_client: httpx.AsyncClient | None = None,
) -> dict:
    """Process a single file: download from HF and upload to S3.

    Separates download and upload into two phases with independent semaphores:
    - Download phase: Holds download_semaphore
    - Upload phase: Holds upload_semaphore (download_semaphore is released)

    This allows other downloads to start while this file is being uploaded.

    Args:
        download_semaphore: Semaphore for controlling download concurrency
        upload_semaphore: Semaphore for controlling upload concurrency
        check_semaphore: Semaphore for controlling S3 existence check concurrency
        repo_id: Repository ID
        repo_type: Repository type
        commit_hash: Commit hash (for logging)
        repo_file: RepoFile object
        access_token: Optional access token
        cancel_event: Event to signal cancellation
        progress_tracker: Progress tracker for reporting

    Returns:
        Result dict with keys:
        - status: "uploaded" | "exists"
        - path: File path
        - blob_id: Blob ID
        - size: File size

    Raises:
        DownloadError: If download or upload fails
    """
    # Calculate blob_id
    blob_id = (
        repo_file.lfs.sha256
        if repo_file.lfs is not None and repo_file.lfs.sha256
        else repo_file.blob_id
    )

    if not blob_id:
        logger.error("No blob_id or lfs_oid for file: {}", repo_file.path)
        raise DownloadError(f"Missing blob_id for {repo_file.path}")

    # Build S3 key (based on blob_id)
    s3_key = build_blob_key(repo_id, repo_type, blob_id)

    # Check if blob already exists in S3 (throttled to avoid overwhelming S3 connection pool)
    async with check_semaphore:
        exists = await s3_client.file_exists(s3_key)

    if exists:
        logger.debug(
            "Blob already exists in S3: {} ({})",
            repo_file.path,
            blob_id[:12],
        )
        # Mark file as completed (S3 already exists, no download needed)
        if progress_tracker:
            await progress_tracker.complete_file(repo_file.path)
        # Return result, database update handled by outer batch
        return {
            "status": "exists",
            "path": repo_file.path,
            "blob_id": blob_id,
            "size": repo_file.size,
        }

    # ==================== Handle empty files (size == 0) ====================
    if repo_file.size == 0:
        logger.debug("Processing empty file: {}", repo_file.path)

        # Mark file as downloading
        if progress_tracker:
            await progress_tracker.mark_file_downloading(repo_file.path)

        # Create empty temp file
        repo_dir = repo_id.replace("/", "--")
        target_path = Path(settings.INCOMPLETE_FILE_PATH) / repo_dir / repo_file.path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.touch()  # Create empty file

        # Mark download complete
        if progress_tracker:
            await progress_tracker.complete_file(repo_file.path)

        # Upload empty file to S3
        async with upload_semaphore:
            # Double-check S3 existence
            if await s3_client.file_exists(s3_key):
                logger.debug(
                    "Empty file was uploaded by another task: {} ({})",
                    repo_file.path,
                    blob_id[:12],
                )
                try:
                    target_path.unlink(missing_ok=True)
                except Exception as e:
                    logger.warning("Failed to clean up temp file {}: {}", target_path, e)
                return {
                    "status": "exists",
                    "path": repo_file.path,
                    "blob_id": blob_id,
                    "size": 0,
                }

            try:
                if progress_tracker:
                    await progress_tracker.start_file_upload(
                        file_path=repo_file.path,
                        total_bytes=0,
                    )

                result = await s3_client.upload_file_from_path(
                    key=s3_key,
                    file_path=str(target_path),
                    metadata={
                        "repo_id": repo_id,
                        "blob_id": blob_id,
                        "size": "0",
                        "source_path": repo_file.path,
                    },
                )

                if progress_tracker:
                    await progress_tracker.complete_file_upload(repo_file.path)

                logger.debug(
                    "Uploaded empty file to S3: {} (blob: {}, etag: {})",
                    repo_file.path,
                    blob_id[:12],
                    result["etag"],
                )

            except Exception as e:
                if progress_tracker:
                    await progress_tracker.fail_file_upload(repo_file.path, str(e))
                raise

            finally:
                try:
                    target_path.unlink(missing_ok=True)
                except Exception as e:
                    logger.warning("Failed to clean up temp file {}: {}", target_path, e)

        return {
            "status": "uploaded",
            "path": repo_file.path,
            "blob_id": blob_id,
            "size": 0,
        }

    # ==================== Phase 1: Download (holds download semaphore) ====================
    logger.debug("Waiting for download semaphore: {}", repo_file.path)
    async with download_semaphore:
        logger.debug("Acquired download semaphore for: {}", repo_file.path)

        # Mark file as downloading (from pending to downloading)
        if progress_tracker:
            await progress_tracker.mark_file_downloading(repo_file.path)

        # Create progress callback (async callback, directly updates progress)
        async def progress_callback(info: ProgressInfo) -> None:
            # Directly update progress to Redis
            if progress_tracker:
                try:
                    await progress_tracker.update_file_progress(
                        file_path=repo_file.path,
                        downloaded=info.downloaded_bytes,
                        total=info.total_bytes or repo_file.size,
                        speed=info.speed_bytes_per_sec,
                    )
                except Exception as e:
                    logger.debug("Failed to update progress: {}", e)

        # Create downloader instance, reusing shared client if available
        async with HttpFileDownloader(
            temp_dir=settings.INCOMPLETE_FILE_PATH,
            progress_callback=progress_callback,
            progress_interval=PROGRESS_INTERVAL,
            client=shared_client,
        ) as downloader:
            # Download file
            url = hf_url(
                repo_id=repo_id,
                filename=repo_file.path,
                repo_type=repo_type,
                revision=commit_hash,
                endpoint=endpoint,
            )
            headers = (
                {"Authorization": f"Bearer {access_token}"} if access_token else None
            )

            # Use repo_id as temp directory, replace "/" with "--"
            repo_dir = repo_id.replace("/", "--")
            target_path = (
                Path(settings.INCOMPLETE_FILE_PATH) / repo_dir / repo_file.path
            )
            target_path.parent.mkdir(parents=True, exist_ok=True)

            logger.debug("Downloading: {} -> {}", repo_file.path, target_path)

            try:
                downloaded_path = await downloader.download(
                    url=url,
                    target_path=target_path,
                    expected_size=repo_file.size,
                    headers=headers,
                    cancel_event=cancel_event,
                )

                # Download completed, mark file as completed
                if progress_tracker:
                    await progress_tracker.complete_file(repo_file.path)

            except Exception as e:
                # Mark file download as failed
                logger.error("Download failed for {}: {}", repo_file.path, e)
                if progress_tracker:
                    await progress_tracker.fail_file(repo_file.path, str(e))
                raise

        # Download completed, download_semaphore is automatically released (async with exit)
        # This allows other download tasks to start immediately

    # ==================== Phase 2: Upload (holds upload semaphore) ====================
    logger.debug(
        "Waiting for upload semaphore: {} -> {} ({})",
        repo_file.path,
        s3_key,
        blob_id[:12],
    )

    async with upload_semaphore:
        logger.debug("Acquired upload semaphore for: {}", repo_file.path)

        # Check again if S3 already exists (might have been uploaded by another task while waiting)
        if await s3_client.file_exists(s3_key):
            logger.debug(
                "Blob was uploaded by another task while waiting: {} ({})",
                repo_file.path,
                blob_id[:12],
            )
            # Clean up local temp file
            try:
                downloaded_path.unlink(missing_ok=True)
            except Exception as e:
                logger.warning(
                    "Failed to clean up temp file {}: {}", downloaded_path, e
                )
            # Return exists status
            return {
                "status": "exists",
                "path": repo_file.path,
                "blob_id": blob_id,
                "size": repo_file.size,
            }

        try:
            # Mark file as uploading
            if progress_tracker:
                await progress_tracker.start_file_upload(
                    file_path=repo_file.path,
                    total_bytes=repo_file.size,
                )

            result = await s3_client.upload_file_from_path(
                key=s3_key,
                file_path=str(downloaded_path),
                metadata={
                    "repo_id": repo_id,
                    "blob_id": blob_id,
                    "size": str(repo_file.size),
                    "source_path": repo_file.path,
                },
            )

            # Mark file upload as completed
            if progress_tracker:
                await progress_tracker.complete_file_upload(repo_file.path)

            logger.debug(
                "Uploaded to S3: {} (blob: {}, etag: {}, size: {})",
                repo_file.path,
                blob_id[:12],
                result["etag"],
                result["size"],
            )

        except Exception as e:
            # Mark file upload as failed
            if progress_tracker:
                await progress_tracker.fail_file_upload(repo_file.path, str(e))
            raise

        finally:
            # Clean up local temp file
            try:
                downloaded_path.unlink(missing_ok=True)
                logger.debug("Cleaned up temp file: {}", downloaded_path)
            except Exception as e:
                logger.warning(
                    "Failed to clean up temp file {}: {}", downloaded_path, e
                )

    # Return result, database update handled by outer batch
    return {
        "status": "uploaded",
        "path": repo_file.path,
        "blob_id": blob_id,
        "size": repo_file.size,
    }


def _on_download_progress(info: ProgressInfo, file_path: str | None = None) -> None:
    """Handle download progress updates (currently just logs).

    Args:
        info: Progress information
        file_path: Optional file path for logging context
    """
    name = file_path or info.target_path.name
    if info.total_bytes:
        percent = info.downloaded_bytes / info.total_bytes * 100
        logger.info(
            "Downloading {}: {:.1f}% ({}/{} bytes, {:.1f} KB/s)",
            name,
            percent,
            info.downloaded_bytes,
            info.total_bytes,
            info.speed_bytes_per_sec / 1024,
        )
    else:
        logger.info(
            "Downloading {}: {} bytes (unknown total, {:.1f} KB/s)",
            name,
            info.downloaded_bytes,
            info.speed_bytes_per_sec / 1024,
        )
