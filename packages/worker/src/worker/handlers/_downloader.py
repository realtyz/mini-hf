"""异步 HTTP 文件下载器，支持断点续传、中断控制和进度报告。"""

import asyncio
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Awaitable

import httpx
from loguru import logger


class DownloaderError(Exception):
    """下载器基础异常"""

    pass


class DownloadCancelledError(DownloaderError):
    """下载被取消"""

    pass


class DownloadError(DownloaderError):
    """下载失败（网络错误、校验失败等）"""

    pass


@dataclass
class ProgressInfo:
    """下载进度信息"""

    url: str
    target_path: Path
    downloaded_bytes: int
    total_bytes: int | None
    speed_bytes_per_sec: float
    is_resumed: bool


class HttpFileDownloader:
    """异步 HTTP 文件下载器。

    特性：
    - 使用 httpx 进行异步下载
    - 支持断点续传（临时文件使用 .incomplete 后缀）
    - 支持外部中断（通过 cancel() 方法）
    - 支持进度回调（带频率控制）
    - 指数退避重试策略

    使用示例：
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

    # 不应重试的 HTTP 状态码
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

    @property
    def client(self) -> httpx.AsyncClient:
        """延迟初始化 httpx client"""
        if self._client is None:
            self._client = httpx.AsyncClient(
                follow_redirects=True,
                timeout=httpx.Timeout(30.0, connect=10.0),
            )
        return self._client

    def cancel(self) -> None:
        """请求取消当前下载。可从任何线程安全调用。"""
        self._cancel_event.set()

    def reset(self) -> None:
        """重置取消状态，允许复用下载器实例。"""
        self._cancel_event.clear()

    async def close(self) -> None:
        """关闭下载器，释放资源。"""
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _check_cancelled(self, external_event: asyncio.Event | None, url: str) -> None:
        """检查是否被取消，如果是则抛出异常。

        Args:
            external_event: 外部取消事件
            url: 用于错误信息的 URL

        Raises:
            DownloadCancelledError: 如果内部或外部取消事件被设置
        """
        if self._cancel_event.is_set():
            raise DownloadCancelledError(f"Download cancelled: {url}")
        if external_event is not None and external_event.is_set():
            raise DownloadCancelledError(f"Download cancelled by task: {url}")

    async def download(
        self,
        url: str,
        target_path: Path,
        expected_size: int | None = None,
        headers: dict[str, str] | None = None,
        cancel_event: asyncio.Event | None = None,
    ) -> Path:
        """下载单个文件。

        Args:
            url: 文件 URL
            target_path: 最终保存路径
            expected_size: 期望的文件大小（用于校验）
            headers: 额外的请求头
            cancel_event: 外部取消事件，用于任务级取消

        Returns:
            下载完成的文件路径

        Raises:
            DownloadCancelledError: 下载被取消
            DownloadError: 下载失败
        """
        self.reset()

        # 准备临时文件路径
        temp_file = self._get_temp_path(target_path)
        temp_file.parent.mkdir(parents=True, exist_ok=True)

        # 获取已下载大小（用于断点续传）
        downloaded_size = temp_file.stat().st_size if temp_file.exists() else 0
        is_resumed = downloaded_size > 0

        if is_resumed:
            logger.info(f"Resuming download from {downloaded_size} bytes: {url}")

        # 构建请求头
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
                )
            except DownloadCancelledError:
                raise
            except Exception as e:
                last_error = e

                # 判断是否重试以及是否需要重置状态
                should_retry, reset_state = self._should_retry(e, attempt)
                if not should_retry:
                    break

                # 如果需要重置状态（如 416 错误），删除临时文件并从头开始
                if reset_state:
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
                    # 正常断点续传：更新已下载大小和 Range 头部
                    downloaded_size = (
                        temp_file.stat().st_size if temp_file.exists() else 0
                    )
                    if downloaded_size > 0:
                        request_headers["Range"] = f"bytes={downloaded_size}-"
                        is_resumed = True

                    # 计算退避延迟
                    delay = min(
                        self.retry_base_delay * (2**attempt), self.retry_max_delay
                    )
                    logger.warning(
                        f"Download attempt {attempt + 1} failed for {url}: {e}. "
                        f"Retrying in {delay:.1f}s..."
                    )
                    await asyncio.sleep(delay)

        # 所有重试失败
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
    ) -> Path:
        """执行实际下载"""
        mode = "ab" if is_resumed else "wb"

        async with self.client.stream("GET", url, headers=headers) as response:
            # 检查服务器是否真正支持 Range 请求
            # 如果我们发送了 Range 头但服务器返回 200 OK（而非 206 Partial Content），
            # 说明服务器忽略了 Range 头，返回了完整内容
            if is_resumed and response.status_code == 200:
                raise DownloadError(
                    "Server ignored Range header, full content returned. "
                    "Need to restart from beginning."
                )

            # 检查响应状态
            if response.status_code in self.NO_RETRY_STATUS_CODES:
                raise DownloadError(
                    f"HTTP {response.status_code} for {url}: {response.reason_phrase}"
                )
            response.raise_for_status()

            # 获取总大小
            total_size = self._get_total_size(response, downloaded_size)

            # 检查取消
            self._check_cancelled(cancel_event, url)

            # 下载循环
            bytes_since_last_update = 0
            last_update_time = time.monotonic()
            current_size = downloaded_size

            with open(temp_file, mode) as f:
                async for chunk in response.aiter_bytes(chunk_size=self.chunk_size):
                    self._check_cancelled(cancel_event, url)

                    f.write(chunk)
                    current_size += len(chunk)
                    bytes_since_last_update += len(chunk)

                    # 检查是否需要报告进度
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

            # 最终进度报告
            if self.progress_callback:
                await self._report_progress(
                    url=url,
                    target_path=target_path,
                    downloaded=current_size,
                    total=total_size,
                    speed=0.0,
                    is_resumed=is_resumed,
                )

        # 校验文件大小
        if expected_size is not None and current_size != expected_size:
            raise DownloadError(
                f"Size mismatch for {target_path}: "
                f"expected {expected_size}, got {current_size}"
            )

        # 原子重命名
        target_path.parent.mkdir(parents=True, exist_ok=True)
        temp_file.rename(target_path)
        logger.info(f"Downloaded: {target_path}")

        return target_path

    def _get_temp_path(self, target_path: Path) -> Path:
        """获取临时文件路径（与目标文件同目录，添加 .incomplete 后缀）"""
        return target_path.with_suffix(target_path.suffix + ".incomplete")

    def _get_total_size(
        self, response: httpx.Response, downloaded_size: int
    ) -> int | None:
        """从响应中获取总文件大小"""
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
        """报告下载进度"""
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
                # 如果回调是协程，等待它完成
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.warning(f"Progress callback failed: {e}")

    def _should_retry(self, error: Exception, attempt: int) -> tuple[bool, bool]:
        """判断是否应该重试。

        Returns:
            tuple[bool, bool]: (should_retry, reset_state)
            - should_retry: 是否应该重试
            - reset_state: 是否需要重置下载状态（删除临时文件，从头开始）
        """
        if attempt >= self.max_retries:
            return False, False

        # HTTP 状态码检查
        if isinstance(error, httpx.HTTPStatusError):
            status_code = error.response.status_code

            # 416 Range Not Satisfiable: 临时文件大小可能超过服务器文件
            # 需要删除临时文件并从头开始下载
            if status_code == 416:
                return True, True

            # 其他不应重试的状态码
            if status_code in self.NO_RETRY_STATUS_CODES:
                return False, False

            # 其他 HTTP 错误可以重试
            return True, False

        # 网络错误应该重试
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
            return True, False

        # 检查是否是 Range 被忽略的情况（服务器返回 200 而非 206）
        if isinstance(error, DownloadError):
            error_msg = str(error)
            if "Server ignored Range header" in error_msg:
                # 需要删除临时文件并从头开始下载
                return True, True

        # 其他错误不重试
        return False, False

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
