# Worker 包代码审查报告

**审查者**：资深 Python 开发者  
**日期**：2026-04-12  
**审查范围**：`packages/worker`  
**总评**：**需要重大改进**

---

## 1. 审查清单

基于 worker 包的功能定位（从 HuggingFace 下载/上传模型的后台任务处理器）和 Python 最佳实践，采用以下审查清单：

| # | 类别 | 权重 |
|---|------|------|
| 1 | 代码重复（DRY 原则） | 高 |
| 2 | 类型提示与类型安全 | 中 |
| 3 | 错误处理与健壮性 | 高 |
| 4 | 异步模式与并发安全 | 高 |
| 5 | 资源管理（会话、文件、连接） | 高 |
| 6 | 代码结构与模块化（函数长度、关注点分离） | 中 |
| 7 | 命名与一致性（PEP 8、语言） | 中 |
| 8 | 安全性（密钥、输入验证） | 高 |
| 9 | 配置与魔法值 | 中 |
| 10 | 日志实践 | 低 |
| 11 | 测试与可测试性 | 高 |
| 12 | 文档质量 | 低 |

---

## 2. 按类别列出的问题

### 2.1 代码重复（DRY）— **严重**

#### 问题 2.1.1：下载器实现重复
**严重程度**：🔴 严重  
**涉及文件**：`handlers/_downloader.py` vs `services/downloader.py`

项目中存在两个几乎完全相同的 `HttpFileDownloader` 实现：

- `handlers/_downloader.py`（433 行）— 格式规范，英文文档字符串
- `services/downloader.py`（361 行）— 格式混乱，中文注释

两者都定义了 `DownloaderError`、`DownloadCancelledError`、`DownloadError`、`ProgressInfo` 和 `HttpFileDownloader`，功能完全一致。handlers 版本在生产代码中被导入使用（`file_processor.py:12-16`），而 services 版本似乎完全未被使用。

**影响**：任何 bug 修复或功能添加都需要同步改两处。services 版本格式更差（类/方法间无空行），且会与 handlers 版本逐渐产生偏差。

**建议**：完全删除 `services/downloader.py`。保留 `handlers/_downloader.py` 作为唯一实现。如果 `services/` 需要下载功能，从 handlers 重新导出即可。

#### 问题 2.1.2：下载处理器逻辑重复
**严重程度**：🟠 重要  
**涉及文件**：`handlers/hf/handler.py`（第 112-307 行）

`handle_download_huggingface` 函数包含两个几乎相同的代码路径：

- **增量更新路径**（第 112-235 行）：已有快照 → 计算差异 → 下载 → 清理 → 激活 → 归档
- **首次下载路径**（第 237-306 行）：获取文件树 → 过滤文件 → 保存文件树 → 下载 → 激活

两条路径共享：进度追踪器初始化、`download_and_upload_files` 调用、快照保存/提交、快照激活等逻辑。重复代码约 70 行。

**建议**：将共享逻辑提取为辅助函数：

```python
async def _download_files_and_activate(
    repo_id, repo_type, revision, commit_hash,
    files_to_download, access_token, cancel_event,
    tree_repo, progress_tracker, endpoint,
    snapshot_repo, session, tree_items, repo_info
):
    # 保存文件树、下载、激活 — 共享逻辑
```

#### 问题 2.1.3：错误/取消时统计信息保存逻辑重复
**严重程度**：🟡 次要  
**涉及文件**：`handlers/hf/handler.py`（第 345-368 行与第 416-438 行）

取消处理和错误处理中包含几乎相同的代码块：

1. 获取进度快照
2. 通过原始 SQL 更新任务统计
3. 提交会话

**建议**：提取为辅助函数：

```python
async def _save_download_stats(task_id: int, session, progress_tracker):
    downloaded_file_count, downloaded_bytes = await progress_tracker.get_progress_snapshot()
    await session.execute(update(Task).where(Task.id == task_id).values(...))
    await session.commit()
```

---

### 2.2 类型提示与类型安全 — **需要改进**

#### 问题 2.2.1：TaskHandler Protocol 签名与实际处理器不匹配
**严重程度**：🔴 严重  
**涉及文件**：`handlers/base.py` vs 实际处理器

```python
# base.py — Protocol 定义：
class TaskHandler(Protocol):
    async def __call__(self, task: Task) -> None: ...

# 实际处理器签名 (handler.py:32)：
async def handle_download_huggingface(task: Task, cancel_event: asyncio.Event) -> None:
```

每个处理器都接受 `(task, cancel_event)` 两个参数，但 Protocol 只接受 `(task)` 一个参数。这意味着 `TaskHandler` 在整个代码库中从未正确描述任何处理器。mypy 会将所有处理器注册标记为类型错误。

**建议**：修复 Protocol：

```python
class TaskHandler(Protocol):
    async def __call__(self, task: Task, cancel_event: asyncio.Event) -> None: ...
```

同时更新 `HandlerFunc`：

```python
HandlerFunc = Callable[[Task, asyncio.Event], Awaitable[None]]
```

#### 问题 2.2.2：类型注解风格不一致
**严重程度**：🟡 次要  
**涉及文件**：`worker.py`

第 47 行使用了旧的 `Dict` 类型：
```python
self._handlers: Dict[str, Callable[[Task, asyncio.Event], Any]] = {}
```

而第 80 行使用了现代的 `set[asyncio.Task]`：
```python
running_tasks: set[asyncio.Task] = set()
```

**建议**：统一使用现代 `dict[str, ...]` 写法。移除 `from typing import Dict`。

#### 问题 2.2.3：处理器的返回类型使用 `Any`
**严重程度**：🟡 次要  
**涉及文件**：`worker.py:47`

处理器实际返回 `None`，但类型注解使用的是 `Callable[[Task, asyncio.Event], Any]`，丢失了类型安全性。

**建议**：使用 `Callable[[Task, asyncio.Event], Awaitable[None]]`。

---

### 2.3 错误处理与健壮性 — **需要改进**

#### 问题 2.3.1：信号量双重释放缺陷
**严重程度**：🟠 重要  
**涉及文件**：`worker.py:83-120`

```python
while self._running:
    await semaphore.acquire()
    # ...
    t = asyncio.create_task(process_and_release(task))  # 第 112 行
    # ...
except Exception as e:
    semaphore.release()  # 第 118 行 — 在此处释放
```

以及 `process_and_release` 内部：
```python
async def process_and_release(task: Task) -> None:
    try:
        await self._process_task(...)
    finally:
        semaphore.release()  # 也在此处释放
```

如果在 `asyncio.create_task()` 成功之后（第 113-114 行，如 `running_tasks.add(t)` 或 `t.add_done_callback()`）发生异常，except 块会释放信号量，而当任务完成时 `process_and_release` 也会释放 — **双重释放**。

对 `Semaphore(1)` 调用 `asyncio.Semaphore.release()` 会将计数器增加到 1 以上，从而允许超过一个并发任务，静默地破坏并发控制。

**建议**：重构以避免双重释放：

```python
async def _run_task(self, task: Task, semaphore: asyncio.Semaphore) -> None:
    try:
        await self._process_task(self._task_service, task)
    finally:
        semaphore.release()

# 在主循环中：
try:
    await semaphore.acquire()
    if not self._running:
        semaphore.release()
        break
    tasks = await self._task_service.get_next_task(batch_size=1)
    if not tasks:
        semaphore.release()
        await asyncio.sleep(self.poll_interval)
        continue
    task = tasks[0]
    t = asyncio.create_task(self._run_task(task, semaphore))
    running_tasks.add(t)
    t.add_done_callback(running_tasks.discard)
except Exception as e:
    # 仅在未移交至任务时释放
    semaphore.release()
    self._logger.error("Error: {}", e)
    await asyncio.sleep(self.poll_interval)
```

关键变化是让所有权语义更清晰——`create_task` 极不可能抛出异常，但结构应使释放责任明确。

#### 问题 2.3.2：handler.py 中的裸 Exception 捕获
**严重程度**：🟡 中等  
**涉及文件**：`handlers/hf/handler.py:413`

```python
except Exception as e:
```

这会捕获所有 `Exception` 子类。更重要的是，它吞掉了意外异常并将其转换为任务失败，没有区分瞬态错误和永久错误。

**建议**：至少记录完整的堆栈跟踪：

```python
except Exception as e:
    logger.exception("Download failed for {}: {}", repo_id, e)
```

#### 问题 2.3.3：try 块外的会话泄漏
**严重程度**：🟠 重要  
**涉及文件**：`handlers/hf/handler.py:74`

```python
session = get_session()  # 第 74 行
profile_repo = HfRepoProfileRepository(session)  # 第 75 行
# ... 多个仓库初始化 ...
# try 块从第 84 行开始
# finally: await session.close()  # 第 472 行
```

如果任何仓库初始化（第 75-82 行）抛出异常，会话将永远不会被关闭 — 造成泄漏。

**建议**：使用异步上下文管理器或将会话创建移到 try 块内：

```python
session = get_session()
try:
    profile_repo = HfRepoProfileRepository(session)
    # ... 处理器的其余部分
finally:
    await session.close()
```

或者更好的方式，如果 `get_session` 支持，使用 `async with`。

---

### 2.4 异步模式与并发安全 — **存在问题**

#### 问题 2.4.1：信号处理不兼容 Windows
**严重程度**：🟠 重要  
**涉及文件**：`worker.py:77`

```python
signal.signal(signal.SIGTERM, lambda s, f: self._signal_handler())
```

在 Windows 上，`signal.SIGTERM` 会引发 `ValueError`。注释写着"Windows compatible"，但 `SIGTERM` 注册会在 Windows 上崩溃。

**建议**：防护信号注册：

```python
import platform

signal.signal(signal.SIGINT, lambda s, f: self._signal_handler())
if platform.system() != "Windows":
    signal.signal(signal.SIGTERM, lambda s, f: self._signal_handler())
```

#### 问题 2.4.2：循环内的 `asyncio.create_task` 存在闭包风险
**严重程度**：🟡 低（当前安全）  
**涉及文件**：`worker.py:106-110`

```python
async def process_and_release(task: Task) -> None:
    try:
        await self._process_task(self._task_service, task)
    finally:
        semaphore.release()
```

虽然目前因为 `task` 是作为参数传递（而非闭包变量）而正常工作，但在 `while` 循环内定义内部函数是延迟绑定 bug 的常见来源。该函数还从外层作用域捕获了 `self` 和 `semaphore`。

**建议**：将此改为 `Worker` 类的私有方法 `_run_task`，显式传入 `task` 和 `semaphore` 作为参数。

---

### 2.5 资源管理 — **需要改进**

#### 问题 2.5.1：数据库会话管理模式不一致
**严重程度**：🟠 重要  
**涉及文件**：`handlers/hf/handler.py:74, 319-327`

处理器直接创建和管理数据库会话：

```python
session = get_session()  # 未使用上下文管理器
# ... 400 行 ...
finally:
    await session.close()  # 手动清理
```

而 `TaskService` 则正确使用了 `@asynccontextmanager` 管理会话生命周期。处理器还通过 `session.execute(update(Task)...)` 直接执行原始 SQL（第 319 行），绕过了其他地方统一使用的仓库模式。

**影响**：错误时没有自动回滚。如果异常发生在两次提交之间，部分数据可能以不一致状态持久化。

**建议**：
1. 使用上下文管理器包装会话：`async with get_session() as session:`
2. 将原始 SQL 更新移至仓库方法，如 `TaskRepository.update_download_stats(task_id, ...)`

#### 问题 2.5.2：HttpFileDownloader 未使用异步上下文管理器
**严重程度**：🟡 中等  
**涉及文件**：`handlers/hf/file_processor.py:323-372`

`HttpFileDownloader` 实现了 `__aenter__`/`__aexit__`，但却用了手动 `try/finally`：

```python
downloader = HttpFileDownloader(...)
try:
    downloaded_path = await downloader.download(...)
except Exception as e:
    ...
finally:
    await downloader.close()
```

**建议**：使用上下文管理器：

```python
async with HttpFileDownloader(...) as downloader:
    downloaded_path = await downloader.download(...)
```

#### 问题 2.5.3：临时文件清理未保证
**严重程度**：🟡 中等  
**涉及文件**：`file_processor.py:396-401, 449-455`

临时文件删除使用了 `try/except` 包裹 `unlink`，但如果进程崩溃（OOM、kill -9），`.incomplete` 文件将残留。处理器的 `finally` 块（第 474-480 行）会清理整个仓库目录，但只针对整个仓库，而非单独的文件。

**建议**：考虑添加启动清理逻辑，删除超过一定时间的陈旧 `.incomplete` 文件，或添加定期清理任务。

---

### 2.6 代码结构与模块化 — **需要改进**

#### 问题 2.6.1：单体式处理器函数
**严重程度**：🟠 重要  
**涉及文件**：`handlers/hf/handler.py:32-481`

`handle_download_huggingface` 是一个 450 行的异步函数。它负责处理：
- Profile 状态管理
- 仓库信息获取
- 差异计算
- 文件树保存
- 文件下载协调
- 快照激活/归档
- 取消处理与状态恢复
- 错误处理与状态恢复
- 临时目录清理

**建议**：分解为聚焦的子函数：

```python
async def handle_download_huggingface(task, cancel_event):
    async with get_session() as session:
        repos = init_repos(session)
        try:
            await _process_download(task, cancel_event, repos, session)
        except DownloadCancelledError:
            await _handle_cancellation(task, repos, session)
            raise
        except Exception:
            await _handle_failure(task, repos, session)
            raise
        finally:
            await _cleanup_temp(task.repo_id)

async def _process_download(task, cancel_event, repos, session):
    # 核心下载逻辑

async def _handle_cancellation(task, repos, session):
    # 取消时恢复 profile 状态

async def _handle_failure(task, repos, session):
    # 失败时恢复 profile 状态
```

#### 问题 2.6.2：跨模块边界访问私有属性
**严重程度**：🟡 中等  
**涉及文件**：`handlers/hf/tree_saver.py:62`

```python
session = snapshot_repo._session  # 访问私有属性
```

这破坏了封装性，在 `tree_saver` 和 `HfRepoSnapshotRepository` 的内部结构之间产生了紧耦合。

**建议**：为仓库添加公共 `session` 属性：

```python
class HfRepoSnapshotRepository:
    @property
    def session(self) -> AsyncSession:
        return self._session
```

---

### 2.7 命名与一致性 — **存在问题**

#### 问题 2.7.1：注释和文档字符串语言混用
**严重程度**：🟡 中等  
**涉及文件**：`services/downloader.py`、`services/progress_tracker.py`

- `services/downloader.py`：所有注释和文档字符串均为中文
- `services/progress_tracker.py`：混合使用 — 类级别文档字符串为英文，方法文档字符串为中文（第 120-128、248-255、332-338 行）
- `handlers/_downloader.py`：英文文档字符串，中文行内注释（第 65 行）
- 其余模块一致使用英文

**建议**：统一所有注释和文档字符串为英文。虽然项目看起来是多语言团队项目，但英文是主导语言。

#### 问题 2.7.2：已弃用模块无移除计划
**严重程度**：🟡 次要  
**涉及文件**：`handlers/hf_handler.py`

弃用通知写着"Use `worker.handlers.hf` instead"，但未指定移除版本或日期。此模块已存在，应要么移除，要么设定具体的移除时间线。

**建议**：添加弃用版本/日期：

```python
"""
.. deprecated:: 0.2.0
    请改用 `worker.handlers.hf`。将在 0.3.0 版本中移除。
"""
import warnings
warnings.warn(
    "hf_handler 已弃用，请使用 worker.handlers.hf",
    DeprecationWarning,
    stacklevel=2,
)
```

#### 问题 2.7.3：导入风格不一致
**严重程度**：🟡 次要  
**涉及文件**：`handlers/hf/handler.py`

```python
from loguru import logger  # 第 22 行 — 在数据库导入之后
```

logger 在导入块中间被导入。PEP 8 约定将第三方导入放在标准库之后，然后是本地导入。`loguru` 混在了本地包导入中。

**建议**：按标准库/第三方/本地分组排列导入。

---

### 2.8 安全性 — **存在问题**

#### 问题 2.8.1：请求头中的访问令牌
**严重程度**：🟡 中等（未发现当前泄漏）  
**涉及文件**：`handlers/hf/file_processor.py:338-339`

```python
headers = (
    {"Authorization": f"Bearer {access_token}"} if access_token else None
)
```

虽然当前 token 没有被日志记录，但如果启用了调试级别日志，`HttpFileDownloader` 可能会记录请求头。此外，`repo_info` 对象的字符串表示中可能包含 token。

**建议**：在下载器中添加脱敏步骤，在记录任何日志前删除 `Authorization` 头。考虑使用 `httpx` 的事件钩子从日志输出中剥离敏感头。

#### 问题 2.8.2：未验证的任务字段
**严重程度**：🟡 中等  
**涉及文件**：`handlers/hf/handler.py:48-53`

```python
repo_id = task.repo_id
repo_type = task.repo_type
revision = task.revision
access_token = task.access_token
repo_items = task.repo_items or []
```

任务字段被直接使用而未经验证。格式错误的 `repo_id`（例如包含路径遍历如 `../../etc/passwd`）可能导致文件系统操作在危险路径上执行（参见 `file_processor.py:224-225`，其中 `repo_id.replace("/", "--")` 被用于构建文件系统路径）。

**建议**：在处理器入口点验证 `repo_id`、`repo_type` 和 `revision`：

```python
import re
if not re.match(r'^[a-zA-Z0-9._\-/]+$', repo_id):
    raise ValueError(f"Invalid repo_id: {repo_id}")
```

---

### 2.9 配置与魔法值 — **需要改进**

#### 问题 2.9.1：硬编码的并发和计时值
**严重程度**：🟡 中等  
**涉及文件**：`worker.py:33-35`、`file_processor.py:22-28`、`_downloader.py:68-79`

| 值 | 位置 | 当前值 |
|---|------|--------|
| `poll_interval` | `worker.py:33` | 2.0s |
| `max_concurrent` | `worker.py:34` | 1 |
| `cancel_check_interval` | `worker.py:35` | 5.0s |
| `DEFAULT_CONCURRENT_DOWNLOADS` | `file_processor.py:22` | 3 |
| `DEFAULT_CONCURRENT_UPLOADS` | `file_processor.py:23` | 5 |
| `PROGRESS_INTERVAL` | `file_processor.py:28` | 1.0s |
| `max_retries` | `_downloader.py:76` | 5 |
| `retry_base_delay` | `_downloader.py:77` | 5.0s |
| `retry_max_delay` | `_downloader.py:78` | 30.0s |
| `chunk_size` | `_downloader.py:79` | 8192 |
| `NO_RETRY_STATUS_CODES` | `_downloader.py:66` | `{400,401,403,404,405,406,410}` |

这些值都不可通过环境变量或 `core.settings` 配置。

**建议**：将可调值移至 `core.settings`：

```python
class WorkerSettings(BaseSettings):
    worker_poll_interval: float = 2.0
    worker_max_concurrent: int = 1
    worker_cancel_check_interval: float = 5.0
    download_concurrent: int = 3
    upload_concurrent: int = 5
    download_max_retries: int = 5
```

#### 问题 2.9.2：HTTP 客户端超时硬编码
**严重程度**：🟡 中等  
**涉及文件**：`handlers/_downloader.py:97`

```python
self._client = httpx.AsyncClient(
    follow_redirects=True,
    timeout=httpx.Timeout(30.0, connect=10.0),
)
```

30 秒总超时和 10 秒连接超时是硬编码的。对于大型模型文件（数 GB），30 秒读取超时可能太短。

**建议**：使其可配置。对于大文件下载，考虑移除读取超时，改为依赖进度回调超时。

---

### 2.10 日志实践 — **次要问题**

#### 问题 2.10.1：生产代码路径中过多的调试日志
**严重程度**：🟡 次要  
**涉及文件**：`handlers/hf/file_processor.py`

第 69、74、93、94 行等使用 `logger.debug()` 输出大量消息，在下载大型仓库时（可能数百个文件）会极为频繁。虽然 debug 级别是合适的，但部分消息缺少结构化上下文：

```python
logger.debug("Creating {} download tasks...", len(files))
logger.debug("Waiting for {} download tasks to complete...", len(download_tasks))
logger.debug("All download tasks completed, processing results...")
```

这些一次性日志消息不包含 `repo_id` 上下文，在并发场景下难以追踪。

**建议**：在日志消息中包含结构化上下文：

```python
logger.debug("Creating {} download tasks for {}", len(files), repo_id)
```

#### 问题 2.10.2：日志消息格式不一致
**严重程度**：🟡 次要  
**涉及文件**：`handlers/hf/handler.py`

部分日志消息使用 `"  ->"` 前缀缩进：

```python
logger.info("  -> Downloading from HuggingFace: ...")
logger.info("  -> Using provided access token")
```

而 `worker.py` 则不使用：

```python
self._logger.info("Got task: {}", task.id)
```

**建议**：选择一种格式。建议移除 `"  ->"` 前缀，改用带上下文字段的结构化日志。

---

### 2.11 测试与可测试性 — **严重缺失**

#### 问题 2.11.1：不存在任何测试
**严重程度**：🔴 严重  
**目录**：`packages/*/tests/`

根据 AGENTS.md："No test suite yet — `packages/*/tests/` directories don't exist yet."

Worker 包的测试覆盖率为零。考虑到其复杂性（并发任务处理、数据库交互、文件下载、S3 上传、取消机制、错误恢复），这是一个重大风险。

**建议**：优先编写以下单元测试：

1. `diff_calculator.py` — 纯逻辑，最易测试
2. `worker.py` — Worker 循环、取消机制、并发语义
3. `_downloader.py` — HTTP 下载与重试逻辑（使用 `httpx` mock transport）
4. `file_processor.py` — 文件下载/上传编排（模拟 S3、模拟 HF）
5. `handler.py` — 使用模拟仓库的集成测试

#### 问题 2.11.2：紧耦合阻碍可测试性
**严重程度**：🟠 重要  
**涉及文件**：`handler.py`、`worker.py`

- `handler.py` 直接调用 `get_session()`、`HuggingfaceService()`、`ConfigService()` 和 `s3_client` — 没有依赖注入
- `Worker.__init__` 内部创建 `TaskService()` — 测试中无法替换
- `file_processor.py` 使用模块级 `s3_client` 单例

**建议**：通过构造函数参数接受依赖：

```python
class Worker:
    def __init__(self, task_service: TaskService | None = None, ...):
        self._task_service = task_service or TaskService()
```

---

### 2.12 文档 — **基本合格但有不足**

#### 问题 2.12.1：模块文档字符串良好，函数文档字符串缺失
**严重程度**：🟡 次要  
**涉及文件**：`handler.py`、`file_processor.py`

模块级文档字符串存在且有帮助。然而，`_process_single_file`（一个 320 行的函数）有文档字符串，而 `handle_download_huggingface`（主入口点，450 行）虽然有文档字符串，但其中许多中间代码块缺少文档。

#### 问题 2.12.2：README 为空
**严重程度**：🟡 次要  
**涉及文件**：`packages/worker/README.md`

README 是一个空文件。

**建议**：添加基本文档：项目用途、架构概述、运行方式、配置选项。

---

## 3. 严重和重要问题汇总

| 编号 | 严重程度 | 类别 | 描述 |
|------|----------|------|------|
| 2.1.1 | 🔴 严重 | DRY | 两个文件中存在重复的 `HttpFileDownloader` |
| 2.2.1 | 🔴 严重 | 类型安全 | `TaskHandler` Protocol 签名与实际处理器不匹配 |
| 2.11.1 | 🔴 严重 | 测试 | 测试覆盖率为零 |
| 2.3.1 | 🟠 重要 | 错误处理 | Worker 循环中的信号量双重释放缺陷 |
| 2.3.3 | 🟠 重要 | 资源管理 | try 块外的会话泄漏 |
| 2.5.1 | 🟠 重要 | 资源管理 | 原始 SQL + 手动会话管理绕过仓库模式 |
| 2.6.1 | 🟠 重要 | 结构 | 450 行单体处理器函数 |
| 2.1.2 | 🟠 重要 | DRY | 增量更新与首次下载路径的重复下载逻辑 |
| 2.4.1 | 🟠 重要 | 并发 | SIGTERM 信号注册在 Windows 上崩溃 |
| 2.11.2 | 🟠 重要 | 测试 | 紧耦合阻碍单元测试 |

## 4. 建议的优先级行动

1. **删除重复的 `services/downloader.py`** — 即刻执行，零风险变更
2. **修复 `TaskHandler` Protocol** — 快速修复，启用类型检查
3. **修复信号量双重释放** — 并发缺陷，隐蔽但真实
4. **将会话创建包裹在 try/finally 中** — 资源泄漏修复
5. **将原始 SQL 移至仓库** — 一致性改进
6. **为 Windows 防护 SIGTERM** — 平台兼容性
7. **将 Worker 配置添加到 `core.settings`** — 配置改进
8. **为 `diff_calculator.py` 编写测试** — 首个容易的测试目标
9. **分解 `handle_download_huggingface`** — 大型重构，谨慎安排
10. **添加依赖注入以提高可测试性** — 长期投资

---

## 5. 逐文件评估

| 文件 | 行数 | 评估 |
|------|------|------|
| `worker.py` | 256 | 🟡 架构良好，信号量缺陷需修复，信号处理需 Windows 防护 |
| `main.py` | 58 | 🟢 干净的入口，文档良好 |
| `handlers/base.py` | 21 | 🔴 Protocol 签名错误 |
| `handlers/_downloader.py` | 433 | 🟡 实现扎实，需要配置外部化 |
| `handlers/hf/handler.py` | 481 | 🟠 过长，会话泄漏，原始 SQL，路径重复 |
| `handlers/hf/file_processor.py` | 490 | 🟡 功能正常但冗长，需要依赖注入以实现可测试性 |
| `handlers/hf/diff_calculator.py` | 102 | 🟢 干净，文档良好，易于测试 |
| `handlers/hf/tree_saver.py` | 155 | 🟡 访问私有 `_session`，其余干净 |
| `handlers/hf/cleanup.py` | 56 | 🟢 干净，聚焦，文档良好 |
| `handlers/hf_handler.py` | 27 | 🟡 弃用垫片，需要移除计划 |
| `services/downloader.py` | 361 | 🔴 `_downloader.py` 的重复副本，应删除 |
| `services/progress_tracker.py` | 482 | 🟡 功能正常，语言混用，`get_all_file_progress` 中有 N+1 Redis 查询 |