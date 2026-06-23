# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mini-HF is a LAN-focused model cache repository system for HuggingFace/ModelScope. It provides HF Hub-compatible APIs to accelerate model downloads within a local network while reducing external bandwidth usage.

## Architecture

### Backend Package Structure

All backend code is in `packages/` as a uv workspace:

| Package | Path | Purpose |
|---------|------|---------|
| `core` | `packages/core` | Configuration management (`core.settings`) |
| `database` | `packages/database` | SQLAlchemy async models, repositories |
| `cache` | `packages/cache` | Redis cache client and progress tracking |
| `storage` | `packages/storage` | S3-compatible client (boto3) |
| `services` | `packages/services` | HuggingFace/ModelScope service clients |
| `mgmt_server` | `packages/mgmt_server` | Management API (Port 9800) |
| `hf_server` | `packages/hf_server` | HF-compatible API (Port 9801) |
| `worker` | `packages/worker` | Task processor |

**Dependency chain**: `mgmt_server` / `hf_server` / `worker` → `database` / `cache` / `storage` / `services` → `core` (settings). Each server and the worker depend on the infrastructure packages, which all depend on `core` for configuration.

### Settings (`packages/core/src/core/settings.py`)

All configuration is defined via pydantic-settings in a single `Settings` class. Key worker tuning knobs live here:
- `WORKER_POLL_INTERVAL`, `WORKER_MAX_CONCURRENT`, `WORKER_CANCEL_CHECK_INTERVAL`
- `WORKER_CONCURRENT_DOWNLOADS` / `WORKER_CONCURRENT_UPLOADS` / `WORKER_CONCURRENT_S3_CHECKS`
- `WORKER_PROGRESS_INTERVAL`, `WORKER_MAX_RETRIES`, `WORKER_RETRY_BASE_DELAY`, `WORKER_RETRY_MAX_DELAY`

Import via `from core.settings import settings` (module-level singleton).

### Database Layer (`packages/database`)

**Models**: `packages/database/src/database/db_models/` — SQLAlchemy async ORM models. Key entities: `HfRepoProfile`, `HfRepoSnapshot`, `HfRepoTreeItem`, `Task`, `User`, `Announcement`, `SystemConfig`.

**Repositories**: `packages/database/src/database/db_repositories/` — Data access classes that encapsulate SQL queries. Each entity has a dedicated repository (e.g., `TaskRepository`, `HfRepoProfileRepository`).

**Session management** (`packages/database/src/database/core.py`):

- `unit_of_work()` — **Preferred** FastAPI dependency. Commits on success, rolls back on exception, always closes. Use via `Depends(unit_of_work)`.
- `new_session()` — Creates a session; caller manages commit/rollback/close manually. Use in non-FastAPI contexts (worker, scripts).
- `get_db()` / `get_session()` — **Deprecated** aliases. Do not use in new code.

**Alembic**: `alembic.ini` at repo root, migrations in `alembic/versions/`. The `env.py` constructs the DB URL from `PG_*` environment variables (not from settings.py), so migrations need those env vars set.

### Worker Architecture (`packages/worker`)

The worker runs a polling loop that picks up `PENDING` tasks and processes them through a **6-phase download workflow** defined in `BaseDownloadHandler` (`packages/worker/src/worker/handlers/base_handler.py`):

1. `prepare_profile` — Set repo profile status to UPDATING
2. `resolve_commit` — Resolve source endpoint and commit hash
3. `calculate_diff` — Compare new tree against old snapshot, compute file diff (download/update/delete)
4. `save_tree` — Persist snapshot and tree items to database
5. `execute_downloads` — Download from source, upload to S3 (with concurrency semaphores)
6. `finalize_success` — Activate snapshot, set profile ACTIVE, cleanup

The handler is split into four protocol ABCs (Interface Segregation): `ProfileLifecycle`, `TreeLifecycle`, `DownloadInfrastructure`, `CleanupLifecycle`. Source-specific subclasses (e.g., `HfDownloadHandler` in `handlers/hf/handler.py`) implement these protocols.

Key worker modules:
- `handlers/base_handler.py` — Template method orchestrating the 6 phases
- `handlers/diff_calculator.py` — Compares old vs new file trees
- `handlers/file_processor.py` — Concurrent download+upload pipeline
- `handlers/downloader.py` — Byte-transfer implementation (resume, retry)
- `handlers/download_context.py` — Shared state object passed through phases
- `handlers/progress_tracker.py` — Redis-backed progress tracking
- `handlers/contracts.py` — `TaskControl` (cancel/pause signals) and `ExecutionResult`
- `handlers/source_types.py` — Source endpoint type definitions

The `handlers/hf/` subdirectory splits the HuggingFace implementation by phase:
- `handler.py` — Top-level `HfDownloadHandler` wiring the protocols together
- `adapter.py` — Source API adapter (commit/tree resolution)
- `tree_saver.py` — Snapshot + tree-item persistence
- `cleanup.py` — Post-success cleanup (archived snapshots, orphaned files)
- `profile_recovery.py` — Recovery for interrupted/failed profile states

### Key Domain Concepts

**RepoStatus** (`packages/database/src/database/db_models/enums.py`): `ACTIVE` (normal), `INACTIVE` (disabled), `UPDATING` (worker downloading), `CLEANING` (cache scan in progress), `CLEANED` (deletion done).

**SnapshotStatus** (`packages/database/src/database/db_models/enums.py`):
- `INACTIVE`: New snapshot, files not fully downloaded
- `ACTIVE`: Current commit for a revision (latest), files complete
- `ARCHIVED`: Previous active commit, kept for metadata but files may be deleted

**Multi-Version Management**: Each revision only keeps one `ACTIVE` snapshot. Old commits are marked `ARCHIVED` to avoid storage redundancy.

**Task Lifecycle**: `PENDING_APPROVAL → PENDING → RUNNING → COMPLETED / FAILED / CANCELLED` (with intermediate states `CANCELING`, `PAUSING`, `PAUSED`)

### Auth System

JWT-based authentication with access/refresh token pairs. Key files:
- `packages/mgmt_server/src/mgmt_server/api/deps.py` — All FastAPI dependencies (`get_current_user`, `TokenServiceDep`, `UserServiceDep`, `RequireAdmin`, `VerifyCodeServiceDep`, etc.)
- `packages/mgmt_server/src/mgmt_server/api/deps_rate_limit.py` — Rate-limiting dependency for auth endpoints (login, register, send-code)

Auth flows: login (JWT), register with email verification code, forgot/reset password, token refresh, logout. The `get_current_user` dependency validates the JWT and returns the user, used by all protected endpoints. Admin-only routes additionally require `RequireAdmin`.

### Services Layer (`packages/services`)

Service classes encapsulate business logic and external API calls:

| Service | Module | Purpose |
|---------|--------|---------|
| HuggingFace | `services.huggingface.service` | HF Hub API client for resolving commits, listing files, downloading |
| Task | `services.task.service` | Task creation, approval, cancellation, retry logic |
| Config | `services.config.service` | Config value CRUD with encryption for sensitive keys |
| Email | `services.email.services` | SMTP email sending (verification codes, notifications) |
| ConfigProvider | `services.config._provider` | Typed accessors for individual config keys (e.g., `get_hf_endpoints`) |

Config values marked `sensitive: True` in the registry are AES-encrypted at rest in the database. The `ConfigService` handles encryption/decryption transparently using `CONFIG_ENCRYPTION_KEY` (falls back to `JWT_SECRET_KEY`).

### Config Registry (`packages/services/src/services/config/registry.py`)

The `ConfigKey` enum and `ConfigEntry` dataclasses define every system config key with metadata: type, default, category, validation bounds, and UI widget hints. The `/config/schema` endpoint reads from this registry to dynamically generate the settings UI form. New config keys must be registered here — it is the single source of truth. Categories: `EMAIL`, `HUGGINGFACE`, `NOTIFICATION`, `TASK_CONTROL`.

### Frontend

See [frontend/CLAUDE.md](frontend/CLAUDE.md) for detailed frontend conventions (component organization, state management, TanStack Query patterns, naming rules).

End-user feature docs (HF repo flow, task flow, FAQ) live in [frontend/docs/](frontend/docs/) — useful context when working on the UI.

Summary: React 19 + React Router 7 + TanStack Query 5 + Tailwind CSS 4 + shadcn/ui. Zustand for auth state. Entry: `frontend/src/main.tsx`, Routes: `frontend/src/router.tsx`.

Design notes and implementation specs (e.g., the multi-version refactor) live in [docs/plans/](docs/plans/).

### Key Files

- Settings: `packages/core/src/core/settings.py`
- Config registry: `packages/services/src/services/config/registry.py` (single source of truth for system config keys)
- Database session: `packages/database/src/database/core.py`
- Database models: `packages/database/src/database/db_models/`
- Database repositories: `packages/database/src/database/db_repositories/`
- Auth dependencies: `packages/mgmt_server/src/mgmt_server/api/deps.py` (all FastAPI dependencies)
- API routes (mgmt): `packages/mgmt_server/src/mgmt_server/api/v1/endpoints/`
- API routes (HF): `packages/hf_server/src/hf_server/api/endpoints/`
- Worker base handler: `packages/worker/src/worker/handlers/base_handler.py`
- Worker HF handler: `packages/worker/src/worker/handlers/hf/handler.py`
- Frontend router: `frontend/src/router.tsx`
- Frontend API client: `frontend/src/lib/api/`
- Frontend query keys: `frontend/src/lib/query/keys.ts`
- Frontend types: `frontend/src/lib/api/types.ts`

## API Structure

### Management API (Port 9800)

Base: `/api/v1`

| Endpoint | Purpose |
|----------|---------|
| `POST /auth/login` | JWT login |
| `POST /auth/refresh` | Refresh access token |
| `GET /user/me` | Current user info |
| `GET /health` | Health check |
| `/repos/*` | Repository management |
| `/tasks/*` | Task queue operations |
| `/config/schema` | Config schema for UI generation (registry-driven) |
| `/config/batch` | Batch config update |
| `/configs/*` | System configuration |
| `/system/announcements` | Announcement CRUD (uses `Announcement` model, not config keys) |

### HF API (Port 9801)

HF Hub-compatible endpoints for `HF_ENDPOINT`:

| Endpoint | Purpose |
|----------|---------|
| `/api/models/{repo_id}/revision/{revision}` | Repo info |
| `/api/models/{repo_id}/tree/{revision}/{path}` | File tree |
| `/api/models/{repo_id}/resolve/{revision}/{filename}` | File download (redirects to S3 presigned URL) |

## Environment Configuration

Copy `.env.example` to `.env.local` and configure:

- `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD`: Auto-created admin account
- `JWT_SECRET_KEY`: Required for token signing
- `PG_*`: PostgreSQL connection
- `REDIS_URL`: Redis connection
- `S3_*`: S3-compatible storage (MinIO, Ceph, AWS S3)
- `INCOMPLETE_FILE_PATH`: Temp download directory
- `APP_HF_SERVER_URL`: Public URL of the HF API server (used for pagination links and download URLs)
- `CONFIG_ENCRYPTION_KEY`: Encryption key for sensitive config values (falls back to `JWT_SECRET_KEY`)

Frontend environment (create `frontend/.env`):
- `APP_API_BASE_URL`: Management API base URL (e.g., `http://localhost:9800/api/v1`)

## Development Commands

### Backend (Python)

```bash
# Install dependencies
uv sync

# Run management API server
uv run --env-file .env.local python -m mgmt_server.main --reload

# Run HF API server
uv run --env-file .env.local python -m hf_server.main --reload

# Run worker
uv run --env-file .env.local python -m worker.main

# Database migrations (alembic.ini is at repo root)
uv run alembic revision --autogenerate -m "description"
uv run alembic upgrade head
uv run alembic downgrade -1

# Run tests
uv run pytest
uv run pytest packages/database/tests -v

# Linting
uv run ruff check .
uv run ruff check --fix .
```

### Frontend

```bash
cd frontend

# Install dependencies
pnpm install

# Development server
pnpm dev

# Build (also runs `tsc -b` first)
pnpm build

# Lint
pnpm lint

# Add shadcn/ui component
pnpm dlx shadcn@latest add <component>
```

### Docker

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Rebuild and restart a specific service
docker-compose up -d --build mgmt-server
```

## Backend Framework

Both servers use **FastAPI** with async endpoints. Key patterns:
- Route handlers are in `api/v1/endpoints/` with `APIRouter`
- Dependency injection via FastAPI's `Depends()` (e.g., `get_current_user`, `unit_of_work`)
- Background tasks use FastAPI's `BackgroundTasks`
- The worker uses a custom task loop, not FastAPI

## Testing

Backend tests use pytest. Run specific test files:
```bash
uv run pytest packages/cache/tests/test_cache_service.py -v
```

---

# Behavioral Guidelines

Guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
