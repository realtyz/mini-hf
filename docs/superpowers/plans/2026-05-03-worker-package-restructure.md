# Worker Package Directory Structure Optimization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the worker package directory structure by removing dead code, consolidating thin subpackages, renaming ambiguously named files, and fixing duplicate type alias definitions.

**Architecture:** Six independent refactoring changes applied sequentially: delete dead file, move single-module subpackage into parent, two file renames for clarity, relocate a misplaced function, and fix duplicate type aliases. Each change updates all affected import paths. Validated with `ruff check`.

**Tech Stack:** Python 3.12+, uv, ruff

**Risk:** Low. Pure refactoring — no logic changes, no test changes needed. All imports within the worker package only (no external consumers).

---

## Dependency Map

### Affected files (13 source files)

```
worker.py              # duplicate type aliases + import paths
watchdog.py            # import path: base → contracts
main.py                # no changes (uses register_handlers from handlers/__init__)
recovery.py            # inline cleanup_stale_incomplete_files, remove hf dependency
retry.py               # no changes
handlers/__init__.py   # re-export paths: base→contracts, types→source_types, services→progress_tracker
handlers/base_handler.py  # import paths × 3
handlers/diff_calculator.py  # import path: types→source_types
handlers/download_context.py  # import path: types→source_types
handlers/downloader.py  # no changes
handlers/file_processor.py  # import paths × 2
handlers/hf/__init__.py  # remove cleanup_stale_incomplete_files from exports
handlers/hf/adapter.py  # import path: types→source_types
handlers/hf/cleanup.py  # remove cleanup_stale_incomplete_files function
handlers/hf/handler.py  # import paths × 2
handlers/hf/tree_saver.py  # import path: types→source_types

DELETE: handlers/exceptions.py
DELETE: services/__init__.py, services/progress_tracker.py (moved)
DELETE: handlers/base.py (renamed to contracts.py)
DELETE: handlers/types.py (renamed to source_types.py)
```

---

### Task 1: Delete dead file `handlers/exceptions.py`

**Files:**
- Delete: `packages/worker/src/worker/handlers/exceptions.py`

**Pre-check:** No imports reference `worker.handlers.exceptions` anywhere in the codebase.

- [ ] **Step 1: Delete the file**

```bash
rm packages/worker/src/worker/handlers/exceptions.py
```

- [ ] **Step 2: Verify no broken imports**

```bash
uv run ruff check packages/worker
```
Expected: no errors related to this deletion.

- [ ] **Step 3: Commit**

```bash
git add packages/worker/src/worker/handlers/exceptions.py
git commit -m "$(cat <<'EOF'
chore(worker): remove dead exceptions.py stub

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Move `services/progress_tracker.py` into `handlers/`, delete `services/`

**Files:**
- Create: `packages/worker/src/worker/handlers/progress_tracker.py` (copy from services/)
- Modify: `packages/worker/src/worker/handlers/__init__.py` — add re-export for `TaskProgressTracker`
- Modify: `packages/worker/src/worker/handlers/base_handler.py:37` — update import
- Modify: `packages/worker/src/worker/handlers/file_processor.py:21` — update import
- Delete: `packages/worker/src/worker/services/__init__.py`
- Delete: `packages/worker/src/worker/services/progress_tracker.py`

- [ ] **Step 1: Move the file**

```bash
mv packages/worker/src/worker/services/progress_tracker.py packages/worker/src/worker/handlers/progress_tracker.py
```

- [ ] **Step 2: Delete the services directory**

```bash
rm packages/worker/src/worker/services/__init__.py
rmdir packages/worker/src/worker/services/
```

- [ ] **Step 3: Update `handlers/__init__.py` — add re-export for `TaskProgressTracker`**

In `packages/worker/src/worker/handlers/__init__.py`, replace:
```python
from worker.handlers.downloader import (
```
with:
```python
from worker.handlers.progress_tracker import TaskProgressTracker
from worker.handlers.downloader import (
```

- [ ] **Step 4: Update `handlers/__init__.py` — add `TaskProgressTracker` to `__all__`**

Same file, add `"TaskProgressTracker",` to the `__all__` list (after `"ExecutionResult",`).

- [ ] **Step 5: Update `base_handler.py` line 37 — change import source**

In `packages/worker/src/worker/handlers/base_handler.py`, replace:
```python
from worker.services import TaskProgressTracker
```
with:
```python
from worker.handlers.progress_tracker import TaskProgressTracker
```

- [ ] **Step 6: Update `file_processor.py` line 21 — change import source**

In `packages/worker/src/worker/handlers/file_processor.py`, replace:
```python
from worker.services import TaskProgressTracker
```
with:
```python
from worker.handlers.progress_tracker import TaskProgressTracker
```

- [ ] **Step 7: Verify with ruff**

```bash
uv run ruff check packages/worker
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/worker/src/worker/services/ packages/worker/src/worker/handlers/progress_tracker.py packages/worker/src/worker/handlers/__init__.py packages/worker/src/worker/handlers/base_handler.py packages/worker/src/worker/handlers/file_processor.py
git commit -m "$(cat <<'EOF'
refactor(worker): move progress_tracker from services/ into handlers/

The services/ subpackage contained only one module. Merging it into
handlers/ removes unnecessary directory nesting.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Rename `handlers/base.py` → `handlers/contracts.py`

**Files:**
- Rename: `handlers/base.py` → `handlers/contracts.py`
- Modify: `handlers/__init__.py:7` — `base` → `contracts`
- Modify: `handlers/base_handler.py:27` — `base` → `contracts`
- Modify: `handlers/hf/handler.py:15` — `base` → `contracts`
- Modify: `worker.py:18` — `base` → `contracts`, also import `HandlerFunc`
- Modify: `watchdog.py:9` — `base` → `contracts`

- [ ] **Step 1: Rename the file via git mv**

```bash
git mv packages/worker/src/worker/handlers/base.py packages/worker/src/worker/handlers/contracts.py
```

- [ ] **Step 2: Update `handlers/__init__.py` line 7**

Replace:
```python
from worker.handlers.base import HandlerFunc, TaskControl, ExecutionResult
```
with:
```python
from worker.handlers.contracts import HandlerFunc, TaskControl, ExecutionResult
```

- [ ] **Step 3: Update `base_handler.py` line 27**

Replace:
```python
from worker.handlers.base import TaskControl, ExecutionResult
```
with:
```python
from worker.handlers.contracts import TaskControl, ExecutionResult
```

- [ ] **Step 4: Update `hf/handler.py` line 15**

Replace:
```python
from worker.handlers.base import ExecutionResult, TaskControl
```
with:
```python
from worker.handlers.contracts import ExecutionResult, TaskControl
```

- [ ] **Step 5: Update `worker.py` line 18** — change base → contracts

Replace:
```python
from worker.handlers.base import TaskControl, ExecutionResult
```
with:
```python
from worker.handlers.contracts import HandlerFunc, TaskControl, ExecutionResult
```

- [ ] **Step 6: Fix `worker.py` — remove duplicate `HandlerFunc` and `StartupRecoveryFunc`**

Delete lines 25 and 27 (the local `HandlerFunc` and `StartupRecoveryFunc` definitions):

**Line 25** — `HandlerFunc` is now imported from `contracts` (Step 5 above):
```python
HandlerFunc = Callable[[Task, TaskControl], Awaitable[ExecutionResult]]
```
→ delete this line.

**Line 27** — `StartupRecoveryFunc` will be imported from `recovery` (Step 7 below):
```python
StartupRecoveryFunc = Callable[[], Awaitable[None]]
```
→ delete this line.

**Keep** line 26 (`ProfileRecoveryFunc`) — it is only defined in `worker.py` and still needs `Awaitable`:
```python
ProfileRecoveryFunc = Callable[..., Awaitable[None]]
```

**Keep** the typing imports unchanged (`Awaitable` is still needed by `ProfileRecoveryFunc`).

- [ ] **Step 7: Fix `worker.py` — import `StartupRecoveryFunc` instead of redefining it**

In `worker.py`, change line 21 from:
```python
from worker.recovery import StartupRecovery
```
to:
```python
from worker.recovery import StartupRecovery, StartupRecoveryFunc
```

And delete line 27:
```python
StartupRecoveryFunc = Callable[[], Awaitable[None]]
```

- [ ] **Step 8: Update `watchdog.py` line 9**

Replace:
```python
from worker.handlers.base import TaskControl
```
with:
```python
from worker.handlers.contracts import TaskControl
```

- [ ] **Step 9: Verify with ruff**

```bash
uv run ruff check packages/worker
```
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/worker/src/worker/handlers/contracts.py packages/worker/src/worker/handlers/base.py packages/worker/src/worker/handlers/__init__.py packages/worker/src/worker/handlers/base_handler.py packages/worker/src/worker/handlers/hf/handler.py packages/worker/src/worker/worker.py packages/worker/src/worker/watchdog.py
git commit -m "$(cat <<'EOF'
refactor(worker): rename handlers/base.py → contracts.py, fix duplicate type aliases

- Rename base.py to contracts.py for clarity (avoids confusion with base_handler.py)
- Remove duplicate HandlerFunc and StartupRecoveryFunc definitions in worker.py
- Import HandlerFunc from contracts, StartupRecoveryFunc from recovery

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Rename `handlers/types.py` → `handlers/source_types.py`

**Files:**
- Rename: `handlers/types.py` → `handlers/source_types.py`
- Modify (8 files): all imports of `worker.handlers.types` → `worker.handlers.source_types`

- [ ] **Step 1: Rename the file via git mv**

```bash
git mv packages/worker/src/worker/handlers/types.py packages/worker/src/worker/handlers/source_types.py
```

- [ ] **Step 2: Update `handlers/__init__.py` line 23**

Replace:
```python
from worker.handlers.types import (
```
with:
```python
from worker.handlers.source_types import (
```

- [ ] **Step 3: Update `base_handler.py` line 36**

Replace:
```python
from worker.handlers.types import AuthHeaderBuilder, UrlBuilder
```
with:
```python
from worker.handlers.source_types import AuthHeaderBuilder, UrlBuilder
```

- [ ] **Step 4: Update `diff_calculator.py` line 5**

Replace:
```python
from worker.handlers.types import CachedFileInfo, SourceFile
```
with:
```python
from worker.handlers.source_types import CachedFileInfo, SourceFile
```

- [ ] **Step 5: Update `download_context.py` line 7**

Replace:
```python
from worker.handlers.types import SourceFile
```
with:
```python
from worker.handlers.source_types import SourceFile
```

- [ ] **Step 6: Update `file_processor.py` line 20**

Replace:
```python
from worker.handlers.types import AuthHeaderBuilder, SourceFile, UrlBuilder
```
with:
```python
from worker.handlers.source_types import AuthHeaderBuilder, SourceFile, UrlBuilder
```

- [ ] **Step 7: Update `hf/adapter.py` line 13**

Replace:
```python
from worker.handlers.types import (
```
with:
```python
from worker.handlers.source_types import (
```

- [ ] **Step 8: Update `hf/handler.py` line 25**

Replace:
```python
from worker.handlers.types import AuthHeaderBuilder, UrlBuilder
```
with:
```python
from worker.handlers.source_types import AuthHeaderBuilder, UrlBuilder
```

- [ ] **Step 9: Update `hf/tree_saver.py` line 16**

Replace:
```python
from worker.handlers.types import SourceFile, SourceFolder, SourceTreeItem
```
with:
```python
from worker.handlers.source_types import SourceFile, SourceFolder, SourceTreeItem
```

- [ ] **Step 10: Verify with ruff**

```bash
uv run ruff check packages/worker
```
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add packages/worker/src/worker/handlers/source_types.py packages/worker/src/worker/handlers/types.py packages/worker/src/worker/handlers/__init__.py packages/worker/src/worker/handlers/base_handler.py packages/worker/src/worker/handlers/diff_calculator.py packages/worker/src/worker/handlers/download_context.py packages/worker/src/worker/handlers/file_processor.py packages/worker/src/worker/handlers/hf/adapter.py packages/worker/src/worker/handlers/hf/handler.py packages/worker/src/worker/handlers/hf/tree_saver.py
git commit -m "$(cat <<'EOF'
refactor(worker): rename handlers/types.py → source_types.py

Avoids shadowing the Python stdlib 'types' module name.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Move `cleanup_stale_incomplete_files` from `hf/cleanup.py` into `recovery.py`

**Rationale:** `cleanup_stale_incomplete_files` is a generic startup cleanup function (only uses `settings.INCOMPLETE_FILE_PATH`) — it doesn't belong in the HF-specific subpackage. Moving it into `recovery.py` removes the backwards dependency where the top-level `recovery.py` imports from `handlers/hf/`.

**Files:**
- Modify: `handlers/hf/cleanup.py` — remove `cleanup_stale_incomplete_files` function
- Modify: `handlers/hf/__init__.py` — remove from imports and `__all__`
- Modify: `recovery.py` — inline the function, remove hf import

- [ ] **Step 1: Remove the function from `hf/cleanup.py`**

In `packages/worker/src/worker/handlers/hf/cleanup.py`, delete lines 66-128 (the entire `cleanup_stale_incomplete_files` function definition), and also remove the unused imports: `os`, `time`, `Path` from pathlib, `settings` from core (only if they're no longer used by `cleanup_deleted_files`).

Check which imports are used by `cleanup_deleted_files` (lines 16-63):
- `loguru.logger` — YES, used
- `core.settings` — NO, only used by the removed function. **Remove this import.**
- `database.db_repositories.HfRepoTreeRepository` — YES, used
- `storage.s3_client, build_blob_key` — YES, used

So in `hf/cleanup.py`, remove:
- The entire `cleanup_stale_incomplete_files` function (lines 66-128)
- The `INCOMPLETE_SUFFIX` constant (line 13) — only used by the removed function
- The imports: `import os`, `import time`, `from pathlib import Path`, `from core import settings`

- [ ] **Step 2: Update `hf/__init__.py` — remove stale cleanup from exports**

In `packages/worker/src/worker/handlers/hf/__init__.py`, change line 4 from:
```python
from .cleanup import cleanup_deleted_files, cleanup_stale_incomplete_files
```
to:
```python
from .cleanup import cleanup_deleted_files
```

Remove `"cleanup_stale_incomplete_files",` from the `__all__` list (line 15).

- [ ] **Step 3: Add the function into `recovery.py`**

In `packages/worker/src/worker/recovery.py`, replace line 10:
```python
from worker.handlers.hf.cleanup import cleanup_stale_incomplete_files
```
with:
```python
import os
import time
from pathlib import Path

from core import settings
```

Then add the `cleanup_stale_incomplete_files` function (as a module-level function) before the `StartupRecovery` class:

```python
INCOMPLETE_SUFFIX = ".incomplete"


def _cleanup_stale_incomplete_files(
    max_age_seconds: int | None = None,
) -> int:
    """Remove stale .incomplete files and empty directories from the temp path.

    Called at worker startup to clean up leftover files from crashed/interrupted
    downloads.
    """
    if max_age_seconds is None:
        max_age_seconds = settings.WORKER_STALE_FILE_AGE_SECONDS

    incomplete_path = Path(settings.INCOMPLETE_FILE_PATH)
    if not incomplete_path.exists():
        return 0

    now = time.time()
    removed = 0
    scanned = 0

    for dirpath, dirnames, filenames in os.walk(incomplete_path, topdown=False):
        dir_path = Path(dirpath)
        for filename in filenames:
            if not filename.endswith(INCOMPLETE_SUFFIX):
                continue
            scanned += 1
            file_path = dir_path / filename
            try:
                file_age = now - file_path.stat().st_mtime
                if file_age > max_age_seconds:
                    file_path.unlink()
                    removed += 1
                    logger.debug("Removed stale incomplete file: {}", file_path)
            except OSError:
                pass

        if scanned > 0 and scanned % 500 == 0:
            logger.debug(
                "Cleanup scan progress: {} files scanned, {} removed...",
                scanned,
                removed,
            )

        for dirname in dirnames:
            sub_dir = dir_path / dirname
            try:
                if sub_dir.exists() and not any(sub_dir.iterdir()):
                    sub_dir.rmdir()
            except OSError:
                pass

    if removed > 0:
        logger.info("Cleaned up {} stale incomplete file(s)", removed)

    return removed
```

- [ ] **Step 4: Update the call site in `recovery.py` line 29**

Replace:
```python
await asyncio.to_thread(cleanup_stale_incomplete_files)
```
with:
```python
await asyncio.to_thread(_cleanup_stale_incomplete_files)
```

- [ ] **Step 5: Update docstring in `recovery.py`**

Remove line 9 if it mentions `worker.handlers.hf.cleanup` — actually, the import line was already replaced. The docstring of `StartupRecovery` mentions "Cleanup stale incomplete files from temp directory" — this is fine, no change needed.

- [ ] **Step 6: Verify with ruff**

```bash
uv run ruff check packages/worker
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/worker/src/worker/handlers/hf/cleanup.py packages/worker/src/worker/handlers/hf/__init__.py packages/worker/src/worker/recovery.py
git commit -m "$(cat <<'EOF'
refactor(worker): move stale file cleanup from hf/cleanup into recovery.py

cleanup_stale_incomplete_files is a generic startup task unrelated to
HuggingFace. Moving it to recovery.py removes a backwards dependency
from the top-level worker module on the HF-specific subpackage.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Final verification — ruff check and import audit

- [ ] **Step 1: Run ruff check on the entire worker package**

```bash
uv run ruff check packages/worker
```
Expected: All checks passed, no errors.

- [ ] **Step 2: Run ruff check on the full workspace to catch any cross-package import issues**

```bash
uv run ruff check packages/
```
Expected: All checks passed, no errors.

- [ ] **Step 3: Verify the final directory structure matches the target**

```bash
find packages/worker/src/worker -type f -name "*.py" | sort
```

Expected output:
```
packages/worker/src/worker/__init__.py
packages/worker/src/worker/main.py
packages/worker/src/worker/recovery.py
packages/worker/src/worker/retry.py
packages/worker/src/worker/watchdog.py
packages/worker/src/worker/worker.py
packages/worker/src/worker/handlers/__init__.py
packages/worker/src/worker/handlers/base_handler.py
packages/worker/src/worker/handlers/contracts.py
packages/worker/src/worker/handlers/diff_calculator.py
packages/worker/src/worker/handlers/download_context.py
packages/worker/src/worker/handlers/downloader.py
packages/worker/src/worker/handlers/file_processor.py
packages/worker/src/worker/handlers/progress_tracker.py
packages/worker/src/worker/handlers/source_types.py
packages/worker/src/worker/handlers/hf/__init__.py
packages/worker/src/worker/handlers/hf/adapter.py
packages/worker/src/worker/handlers/hf/cleanup.py
packages/worker/src/worker/handlers/hf/handler.py
packages/worker/src/worker/handlers/hf/profile_recovery.py
packages/worker/src/worker/handlers/hf/tree_saver.py
```

- [ ] **Step 4: Final commit (if there are any remaining changes)**

```bash
git status
```

If clean after previous commits, no commit needed. Otherwise, commit any remaining cleanup.

---

## Verification Checklist

After all tasks complete, verify:

1. `uv run ruff check packages/worker` passes without errors
2. No `.py` files remain in `services/` directory
3. No `handlers/exceptions.py` exists
4. No `handlers/base.py` exists (renamed to `contracts.py`)
5. No `handlers/types.py` exists (renamed to `source_types.py`)
6. `handlers/progress_tracker.py` exists (moved from `services/`)
7. `handlers/contracts.py` exists (renamed from `base.py`)
8. `handlers/source_types.py` exists (renamed from `types.py`)
9. `hf/cleanup.py` no longer contains `cleanup_stale_incomplete_files`
10. `recovery.py` contains `_cleanup_stale_incomplete_files` and no longer imports from `worker.handlers.hf.cleanup`
11. `worker.py` imports `HandlerFunc` from `contracts` instead of defining it locally
12. `worker.py` imports `StartupRecoveryFunc` from `recovery` instead of defining it locally
