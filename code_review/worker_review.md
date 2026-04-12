# Worker Package Code Review Report

**Reviewer**: Senior Python Developer  
**Date**: 2026-04-12  
**Scope**: `packages/worker`  
**Verdict**: **Needs Significant Improvement**

---

## 1. Review Checklist

Based on the worker package's role (background task processor for downloading/uploading models from HuggingFace) and Python best practices, the following checklist was used:

| # | Category | Weight |
|---|----------|--------|
| 1 | Code Duplication (DRY) | High |
| 2 | Type Hints & Type Safety | Medium |
| 3 | Error Handling & Resilience | High |
| 4 | Async Patterns & Concurrency Safety | High |
| 5 | Resource Management (Sessions, Files, Connections) | High |
| 6 | Code Structure & Modularity (Function Length, SoC) | Medium |
| 7 | Naming & Consistency (PEP 8, Language) | Medium |
| 8 | Security (Secrets, Input Validation) | High |
| 9 | Configuration & Magic Values | Medium |
| 10 | Logging Practices | Low |
| 11 | Testing & Testability | High |
| 12 | Documentation Quality | Low |

---

## 2. Findings by Category

### 2.1 Code Duplication (DRY) — **CRITICAL**

#### Finding 2.1.1: Duplicated Downloader Implementation
**Severity**: 🔴 Critical  
**Files**: `handlers/_downloader.py` vs `services/downloader.py`

Two nearly identical `HttpFileDownloader` implementations exist:

- `handlers/_downloader.py` (433 lines) — well-formatted, English docstrings
- `services/downloader.py` (361 lines) — poor formatting, Chinese comments

Both define `DownloaderError`, `DownloadCancelledError`, `DownloadError`, `ProgressInfo`, and `HttpFileDownloader` with identical functionality. The handlers version is imported and used in production (`file_processor.py:12-16`). The services version appears unused.

**Impact**: Any bug fix or feature addition must be applied twice. The services version has worse formatting (no blank lines between classes/methods) and will silently drift from the handlers version.

**Recommendation**: Remove `services/downloader.py` entirely. Keep `handlers/_downloader.py` as the canonical implementation. If `services/` needs downloader functionality, re-export from handlers.

#### Finding 2.1.2: Duplicated Download Handler Logic
**Severity**: 🟠 Major  
**File**: `handlers/hf/handler.py` (lines 112-307)

The `handle_download_huggingface` function has two nearly identical code paths:

- **Incremental update path** (lines 112-235): existing snapshot → calculate diff → download → cleanup → activate → archive
- **First download path** (lines 237-306): get tree → filter files → save tree → download → activate

Both paths share: progress tracker initialization, `download_and_upload_files` call, snapshot save/commit, and snapshot activation. The duplicated code totals ~70 lines.

**Recommendation**: Extract shared logic into helper functions:

```python
async def _download_files_and_activate(
    repo_id, repo_type, revision, commit_hash,
    files_to_download, access_token, cancel_event,
    tree_repo, progress_tracker, endpoint,
    snapshot_repo, session, tree_items, repo_info
):
    # Save tree, download, activate — shared logic
```

#### Finding 2.1.3: Duplicated Error/Cancellation Stats Saving
**Severity**: 🟡 Minor  
**File**: `handlers/hf/handler.py` (lines 345-368 and 416-438)

Both the cancellation and error handlers contain near-identical blocks for:

1. Getting progress snapshot
2. Updating task stats via raw SQL
3. Committing the session

**Recommendation**: Extract into a helper:

```python
async def _save_download_stats(task_id: int, session, progress_tracker):
    downloaded_file_count, downloaded_bytes = await progress_tracker.get_progress_snapshot()
    await session.execute(update(Task).where(Task.id == task_id).values(...))
    await session.commit()
```

---

### 2.2 Type Hints & Type Safety — **NEEDS IMPROVEMENT**

#### Finding 2.2.1: TaskHandler Protocol Signature Mismatch
**Severity**: 🔴 Critical  
**File**: `handlers/base.py` vs actual handlers

```python
# base.py — Protocol defines:
class TaskHandler(Protocol):
    async def __call__(self, task: Task) -> None: ...

# Actual handler signature (handler.py:32):
async def handle_download_huggingface(task: Task, cancel_event: asyncio.Event) -> None:
```

Every handler takes `(task, cancel_event)` but the Protocol only accepts `(task)`. This means `TaskHandler` never correctly describes any handler in the codebase. mypy would flag all handler registrations as type errors.

**Recommendation**: Fix the Protocol:

```python
class TaskHandler(Protocol):
    async def __call__(self, task: Task, cancel_event: asyncio.Event) -> None: ...
```

Also update `HandlerFunc`:

```python
HandlerFunc = Callable[[Task, asyncio.Event], Awaitable[None]]
```

#### Finding 2.2.2: Inconsistent Type Annotation Styles
**Severity**: 🟡 Minor  
**File**: `worker.py`

Line 47 uses legacy `Dict` from `typing`:
```python
self._handlers: Dict[str, Callable[[Task, asyncio.Event], Any]] = {}
```

But line 80 uses modern `set[asyncio.Task]`:
```python
running_tasks: set[asyncio.Task] = set()
```

**Recommendation**: Use modern `dict[str, ...]` consistently. Remove `from typing import Dict`.

#### Finding 2.2.3: `Any` Return Type for Handlers
**Severity**: 🟡 Minor  
**File**: `worker.py:47`

Handlers return `None` but the type annotation uses `Callable[[Task, asyncio.Event], Any]`. This loses type safety.

**Recommendation**: Use `Callable[[Task, asyncio.Event], Awaitable[None]]`.

---

### 2.3 Error Handling & Resilience — **NEEDS IMPROVEMENT**

#### Finding 2.3.1: Semaphore Double-Release on Task Creation Failure
**Severity**: 🟠 Major  
**File**: `worker.py:83-120`

```python
while self._running:
    await semaphore.acquire()
    # ...
    t = asyncio.create_task(process_and_release(task))  # line 112
    # ...
except Exception as e:
    semaphore.release()  # line 118 — released HERE
```

And `process_and_release`:
```python
async def process_and_release(task: Task) -> None:
    try:
        await self._process_task(...)
    finally:
        semaphore.release()  # AND released HERE
```

If an exception occurs after `asyncio.create_task()` succeeds (lines 113-114, e.g., `running_tasks.add(t)` or `t.add_done_callback()`), the except block releases the semaphore, and when the task completes, `process_and_release` will also release it — **double-release**.

`asyncio.Semaphore.release()` on a `Semaphore(1)` increments the counter above 1, allowing more than one concurrent task, silently breaking concurrency control.

**Recommendation**: Restructure to avoid double-release:

```python
async def _run_task(self, task: Task, semaphore: asyncio.Semaphore) -> None:
    try:
        await self._process_task(self._task_service, task)
    finally:
        semaphore.release()

# In the main loop:
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
    # Only release if we haven't handed off to a task
    semaphore.release()
    self._logger.error("Error: {}", e)
    await asyncio.sleep(self.poll_interval)
```

The key change is that `create_task` is extremely unlikely to throw, but the structure should make the ownership semantics clear.

#### Finding 2.3.2: Bare Exception Handler in handler.py
**Severity**: 🟡 Medium  
**File**: `handlers/hf/handler.py:413`

```python
except Exception as e:
```

This catches everything including `SystemExit`, `KeyboardInterrupt` descendants (actually no — `KeyboardInterrupt` inherits from `BaseException`, not `Exception`). More importantly, it swallows unexpected exceptions and converts them to task failures without distinguishing between transient and permanent errors.

**Recommendation**: At minimum, log the full traceback:

```python
except Exception as e:
    logger.exception("Download failed for {}: {}", repo_id, e)
```

#### Finding 2.3.3: Session Leak Outside Try Block
**Severity**: 🟠 Major  
**File**: `handlers/hf/handler.py:74`

```python
session = get_session()  # line 74
profile_repo = HfRepoProfileRepository(session)  # line 75
# ... multiple repo initializations ...
# try block starts at line 84
# finally: await session.close()  # line 472
```

If any of the repository initializations (lines 75-82) raise an exception, the session is never closed — it leaks.

**Recommendation**: Use an async context manager or move session creation inside the try block:

```python
session = get_session()
try:
    profile_repo = HfRepoProfileRepository(session)
    # ... rest of the handler
finally:
    await session.close()
```

Or better yet, wrap in `async with` if `get_session` supports it.

---

### 2.4 Async Patterns & Concurrency Safety — **CONCERNS**

#### Finding 2.4.1: Signal Handling Not Windows-Compatible
**Severity**: 🟠 Major  
**File**: `worker.py:77`

```python
signal.signal(signal.SIGTERM, lambda s, f: self._signal_handler())
```

On Windows, `signal.SIGTERM` raises `ValueError`. The comment says "Windows compatible" but `SIGTERM` registration will crash on Windows.

**Recommendation**: Guard the signal registration:

```python
import platform

signal.signal(signal.SIGINT, lambda s, f: self._signal_handler())
if platform.system() != "Windows":
    signal.signal(signal.SIGTERM, lambda s, f: self._signal_handler())
```

#### Finding 2.4.2: `asyncio.create_task` Inside Loop Creates Closure Risk
**Severity**: 🟡 Low (currently safe)  
**File**: `worker.py:106-110`

```python
async def process_and_release(task: Task) -> None:
    try:
        await self._process_task(self._task_service, task)
    finally:
        semaphore.release()
```

While this currently works because `task` is passed as a parameter (not a closure variable), defining an inner function inside a `while` loop is a common source of late-binding bugs. The function also captures `self` and `semaphore` from the enclosing scope.

**Recommendation**: Make this a private method `_run_task` on the `Worker` class, taking `task` and `semaphore` as explicit parameters.

---

### 2.5 Resource Management — **NEEDS IMPROVEMENT**

#### Finding 2.5.1: Inconsistent DB Session Management Pattern
**Severity**: 🟠 Major  
**File**: `handlers/hf/handler.py:74, 319-327`

The handler directly creates and manages a database session:

```python
session = get_session()  # No context manager
# ... 400 lines ...
finally:
    await session.close()  # Manual cleanup
```

Meanwhile, `TaskService` properly uses `@asynccontextmanager` for session lifecycle. The handler also executes raw SQL via `session.execute(update(Task)...)` (line 319), bypassing the repository pattern used everywhere else.

**Impact**: No automatic rollback on error. If an exception occurs between commits, partial data may persist in an inconsistent state.

**Recommendation**:
1. Wrap the session in a context manager: `async with get_session() as session:`
2. Move the raw SQL update to a repository method like `TaskRepository.update_download_stats(task_id, ...)`

#### Finding 2.5.2: HttpFileDownloader Not Used as Async Context Manager
**Severity**: 🟡 Medium  
**File**: `handlers/hf/file_processor.py:323-372`

`HttpFileDownloader` implements `__aenter__`/`__aexit__` but is used with manual `try/finally`:

```python
downloader = HttpFileDownloader(...)
try:
    downloaded_path = await downloader.download(...)
except Exception as e:
    ...
finally:
    await downloader.close()
```

**Recommendation**: Use the context manager:

```python
async with HttpFileDownloader(...) as downloader:
    downloaded_path = await downloader.download(...)
```

#### Finding 2.5.3: Temporary File Cleanup Not Guaranteed
**Severity**: 🟡 Medium  
**Files**: `file_processor.py:396-401, 449-455`

Temp file deletion uses `try/except` around `unlink` but if the process crashes (OOM, kill -9), `.incomplete` files will remain. The handler's `finally` block at line 474-480 cleans up the repo directory, but only for the whole repo, not for individual files that may have been partially downloaded.

**Recommendation**: Consider adding a startup cleanup that removes stale `.incomplete` files older than a threshold, or add a periodic cleanup job.

---

### 2.6 Code Structure & Modularity — **NEEDS IMPROVEMENT**

#### Finding 2.6.1: Monolithic Handler Function
**Severity**: 🟠 Major  
**File**: `handlers/hf/handler.py:32-481`

`handle_download_huggingface` is a single 450-line async function. It handles:
- Profile status management
- Repository info fetching
- Diff calculation
- Tree saving
- File download coordination
- Snapshot activation/archival
- Cancellation handling with state restoration
- Error handling with state restoration
- Temp directory cleanup

**Recommendation**: Decompose into focused sub-functions:

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
    # Core download logic

async def _handle_cancellation(task, repos, session):
    # Restore profile status on cancellation

async def _handle_failure(task, repos, session):
    # Restore profile status on failure
```

#### Finding 2.6.2: Private Attribute Access Across Module Boundary
**Severity**: 🟡 Medium  
**File**: `handlers/hf/tree_saver.py:62`

```python
session = snapshot_repo._session  # Accessing private attribute
```

This breaks encapsulation and creates tight coupling between `tree_saver` and `HfRepoSnapshotRepository`'s internal structure.

**Recommendation**: Add a public `session` property to the repository:

```python
class HfRepoSnapshotRepository:
    @property
    def session(self) -> AsyncSession:
        return self._session
```

---

### 2.7 Naming & Consistency — **ISSUES FOUND**

#### Finding 2.7.1: Mixed Language Comments and Docstrings
**Severity**: 🟡 Medium  
**Files**: `services/downloader.py`, `services/progress_tracker.py`

- `services/downloader.py`: All comments and docstrings are in Chinese
- `services/progress_tracker.py`: Mixed — class-level docstrings in English, method docstrings in Chinese (lines 120-128, 248-255, 332-338)
- `handlers/_downloader.py`: English docstrings, Chinese inline comments (line 65)
- All other modules use English consistently

**Recommendation**: Standardize on English for all comments and docstrings. The project appears to be a mixed-language team project, but English is the dominant language.

#### Finding 2.7.2: Deprecated Module Without Removal Plan
**Severity**: 🟡 Minor  
**File**: `handlers/hf_handler.py`

The deprecation notice says "Use `worker.handlers.hf` instead" but doesn't specify a removal version or date. This module has been present and should either be removed or have a concrete removal timeline.

**Recommendation**: Add a deprecation version/date:

```python
"""
.. deprecated:: 0.2.0
    Use `worker.handlers.hf` instead. Will be removed in 0.3.0.
"""
import warnings
warnings.warn(
    "hf_handler is deprecated, use worker.handlers.hf",
    DeprecationWarning,
    stacklevel=2,
)
```

#### Finding 2.7.3: Inconsistent Import Style
**Severity**: 🟡 Minor  
**File**: `handlers/hf/handler.py`

```python
from loguru import logger  # line 22 — after database imports
```

Logger is imported in the middle of the import block. PEP 8 convention places third-party imports after stdlib, then local imports. `loguru` is mixed with local package imports.

**Recommendation**: Group imports by stdlib / third-party / local.

---

### 2.8 Security — **CONCERNS**

#### Finding 2.8.1: Access Token in Request Headers
**Severity**: 🟡 Medium (no current leak found)  
**File**: `handlers/hf/file_processor.py:338-339`

```python
headers = (
    {"Authorization": f"Bearer {access_token}"} if access_token else None
)
```

While the token isn't currently logged, the `HttpFileDownloader` could log the request headers if debug logging is enabled. Also, `repo_info` objects may contain the token in their string representation.

**Recommendation**: Add a sanitization step in the downloader to redact `Authorization` headers before any logging. Consider using `httpx`'s event hooks to strip sensitive headers from logged output.

#### Finding 2.8.2: Unvalidated Task Fields
**Severity**: 🟡 Medium  
**File**: `handlers/hf/handler.py:48-53`

```python
repo_id = task.repo_id
repo_type = task.repo_type
revision = task.revision
access_token = task.access_token
repo_items = task.repo_items or []
```

Task fields are used directly without validation. A malformed `repo_id` (e.g., containing path traversal like `../../etc/passwd`) could cause filesystem operations on unsafe paths (see `file_processor.py:224-225` where `repo_id.replace("/", "--")` is used to build filesystem paths).

**Recommendation**: Validate `repo_id`, `repo_type`, and `revision` at the handler entry point:

```python
import re
if not re.match(r'^[a-zA-Z0-9._\-/]+$', repo_id):
    raise ValueError(f"Invalid repo_id: {repo_id}")
```

---

### 2.9 Configuration & Magic Values — **NEEDS IMPROVEMENT**

#### Finding 2.9.1: Hardcoded Concurrency and Timing Values
**Severity**: 🟡 Medium  
**Files**: `worker.py:33-35`, `file_processor.py:22-28`, `_downloader.py:68-79`

| Value | Location | Current |
|-------|----------|---------|
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

None of these are configurable via environment variables or `core.settings`.

**Recommendation**: Move tunable values to `core.settings`:

```python
class WorkerSettings(BaseSettings):
    worker_poll_interval: float = 2.0
    worker_max_concurrent: int = 1
    worker_cancel_check_interval: float = 5.0
    download_concurrent: int = 3
    upload_concurrent: int = 5
    download_max_retries: int = 5
```

#### Finding 2.9.2: HTTP Client Timeout Hardcoded
**Severity**: 🟡 Medium  
**File**: `handlers/_downloader.py:97`

```python
self._client = httpx.AsyncClient(
    follow_redirects=True,
    timeout=httpx.Timeout(30.0, connect=10.0),
)
```

30-second total timeout and 10-second connect timeout are hardcoded. For large model files (multiple GB), a 30-second read timeout is likely too short.

**Recommendation**: Make configurable. For large file downloads, consider removing the read timeout and relying on the progress callback timeout instead.

---

### 2.10 Logging — **MINOR ISSUES**

#### Finding 2.10.1: Excessive Debug Logging in Production Code Paths
**Severity**: 🟡 Minor  
**File**: `handlers/hf/file_processor.py`

Lines 69, 74, 93, 94, etc. use `logger.debug()` for messages that will be extremely frequent during a download of a large repo (potentially hundreds of files). While debug-level is appropriate, some messages are unstructured:

```python
logger.debug("Creating {} download tasks...", len(files))
logger.debug("Waiting for {} download tasks to complete...", len(download_tasks))
logger.debug("All download tasks completed, processing results...")
```

These single-use log messages don't include the `repo_id` context, making them hard to trace in concurrent scenarios.

**Recommendation**: Include structured context in log messages:

```python
logger.debug("Creating {} download tasks for {}", len(files), repo_id)
```

#### Finding 2.10.2: Inconsistent Log Message Format
**Severity**: 🟡 Minor  
**File**: `handlers/hf/handler.py`

Some log messages use `"  ->"` prefix indentation:

```python
logger.info("  -> Downloading from HuggingFace: ...")
logger.info("  -> Using provided access token")
```

While `worker.py` doesn't:

```python
self._logger.info("Got task: {}", task.id)
```

**Recommendation**: Pick one format. Recommend removing the `"  ->"` prefix and using structured logging with context fields instead.

---

### 2.11 Testing & Testability — **CRITICAL GAP**

#### Finding 2.11.1: No Tests Exist
**Severity**: 🔴 Critical  
**Directory**: `packages/*/tests/`

Per AGENTS.md: "No test suite yet — `packages/*/tests/` directories don't exist yet."

The worker package has zero test coverage. Given its complexity (concurrent task processing, DB interactions, file downloads, S3 uploads, cancellation, error recovery), this is a significant risk.

**Recommendation**: Prioritize unit tests for:

1. `diff_calculator.py` — pure logic, easiest to test
2. `worker.py` — Worker loop, cancellation, concurrency semantics
3. `_downloader.py` — HTTP download with retry logic (use `httpx` mock transport)
4. `file_processor.py` — File download/upload orchestration (mock S3, mock HF)
5. `handler.py` — Integration tests with mocked repos

#### Finding 2.11.2: Tight Coupling Hinders Testability
**Severity**: 🟠 Major  
**Files**: `handler.py`, `worker.py`

- `handler.py` directly calls `get_session()`, `HuggingfaceService()`, `ConfigService()`, and `s3_client` — no dependency injection.
- `Worker.__init__` creates `TaskService()` internally — can't be substituted in tests.
- `file_processor.py` uses module-level `s3_client` singleton.

**Recommendation**: Accept dependencies as constructor parameters:

```python
class Worker:
    def __init__(self, task_service: TaskService | None = None, ...):
        self._task_service = task_service or TaskService()
```

---

### 2.12 Documentation — **ADEQUATE WITH ISSUES**

#### Finding 2.12.1: Module Docstrings Good, Function Docstrings Missing
**Severity**: 🟡 Minor  
**Files**: `handler.py`, `file_processor.py`

Module-level docstrings are present and helpful. However, `_process_single_file` (a 320-line function) has a docstring, while `handle_download_huggingface` (the main entry point, 450 lines) has one but many of the intermediate code blocks lack documentation.

#### Finding 2.12.2: README is Empty
**Severity**: 🟡 Minor  
**File**: `packages/worker/README.md`

The README is an empty file.

**Recommendation**: Add basic documentation: purpose, architecture overview, how to run, config options.

---

## 3. Summary of Critical and Major Findings

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| 2.1.1 | 🔴 Critical | DRY | Duplicated `HttpFileDownloader` in two files |
| 2.2.1 | 🔴 Critical | Type Safety | `TaskHandler` Protocol signature doesn't match actual handlers |
| 2.11.1 | 🔴 Critical | Testing | Zero test coverage |
| 2.3.1 | 🟠 Major | Error Handling | Semaphore double-release bug in Worker loop |
| 2.3.3 | 🟠 Major | Resource Mgmt | Session leak if initialization fails before try block |
| 2.5.1 | 🟠 Major | Resource Mgmt | Raw SQL + manual session management bypasses repository pattern |
| 2.6.1 | 🟠 Major | Structure | 450-line monolithic handler function |
| 2.1.2 | 🟠 Major | DRY | Duplicated download logic in incremental vs. first-download paths |
| 2.4.1 | 🟠 Major | Concurrency | SIGTERM signal registration crashes on Windows |
| 2.11.2 | 🟠 Major | Testing | Tight coupling prevents unit testing |

## 4. Recommended Priority Actions

1. **Remove duplicate `services/downloader.py`** — Immediate, zero-risk change
2. **Fix `TaskHandler` Protocol** — Quick fix, enables type checking
3. **Fix semaphore double-release** — Concurrency bug, subtle but real
4. **Wrap session creation in try/finally** — Resource leak fix
5. **Move raw SQL to repository** — Consistency improvement
6. **Guard SIGTERM for Windows** — Platform compatibility
7. **Add worker settings to `core.settings`** — Configuration improvement
8. **Write tests for `diff_calculator.py`** — First easy test target
9. **Decompose `handle_download_huggingface`** — Major refactor, schedule carefully
10. **Add dependency injection for testability** — Long-term investment

---

## 5. File-by-File Assessment

| File | Lines | Assessment |
|------|-------|------------|
| `worker.py` | 256 | 🟡 Good architecture, semaphore bug needs fix, signal handling needs Windows guard |
| `main.py` | 58 | 🟢 Clean entry point, well-documented |
| `handlers/base.py` | 21 | 🔴 Protocol signature wrong |
| `handlers/_downloader.py` | 433 | 🟡 Solid implementation, needs config externalization |
| `handlers/hf/handler.py` | 481 | 🟠 Too long, session leak, raw SQL, duplicated paths |
| `handlers/hf/file_processor.py` | 490 | 🟡 Functional but verbose, needs DI for testability |
| `handlers/hf/diff_calculator.py` | 102 | 🟢 Clean, well-documented, easy to test |
| `handlers/hf/tree_saver.py` | 155 | 🟡 Accesses private `_session`, otherwise clean |
| `handlers/hf/cleanup.py` | 56 | 🟢 Clean, focused, well-documented |
| `handlers/hf_handler.py` | 27 | 🟡 Deprecated shim, needs removal plan |
| `services/downloader.py` | 361 | 🔴 Duplicate of `_downloader.py`, should be removed |
| `services/progress_tracker.py` | 482 | 🟡 Functional, mixed language, N+1 Redis queries in `get_all_file_progress` |