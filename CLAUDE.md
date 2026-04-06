# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mini-HF is a LAN-focused model cache repository system for HuggingFace/ModelScope. It provides HF Hub-compatible APIs to accelerate model downloads within a local network while reducing external bandwidth usage.

## Architecture

### System Components

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React Frontend │────▶│  Management API │────▶│   PostgreSQL    │
│  (Port 5173)    │     │   (Port 9800)   │     │  (Tasks/Metadata)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │                         ▲
                               ▼                         │
                        ┌─────────────────┐              │
                        │    HF API       │              │
                        │  (Port 9801)    │              │
                        └─────────────────┘              │
                               │                         │
                               ▼                         │
                        ┌─────────────────┐     ┌─────────────────┐
                        │   S3 Storage    │     │     Redis       │
                        │ (Presigned URLs)│     │ (Cache/Progress)│
                        └─────────────────┘     └─────────────────┘
                               ▲
                               │
                        ┌─────────────────┐
                        │     Worker      │◀──── Polls PostgreSQL task queue
                        │  (Task Processor)│      Downloads models, uploads to S3
                        └─────────────────┘
```

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

### Key Domain Concepts

**SnapshotStatus** (`packages/database/src/database/db_models/enums.py`):
- `INACTIVE`: New snapshot, files not fully downloaded
- `ACTIVE`: Current commit for a revision (latest), files complete
- `ARCHIVED`: Previous active commit, kept for metadata but files may be deleted

**Multi-Version Management**: Each revision only keeps one `ACTIVE` snapshot. Old commits are marked `ARCHIVED` to avoid storage redundancy.

**Task Lifecycle**: `PENDING_APPROVAL → PENDING → RUNNING → COMPLETED/FAILED/CANCELLED`

### Frontend Structure

- **Framework**: React 19 + React Router 7 + TanStack Query + Tailwind CSS 4
- **UI Components**: shadcn/ui (Radix UI + Tailwind)
- **State**: Zustand for auth, TanStack Query for server state
- **Entry**: `frontend/src/main.tsx`
- **Routes**: `frontend/src/router.tsx`
  - Landing pages (`/`, `/docs`, `/repositories`, `/tasks-public`)
  - Auth (`/login`, `/register`)
  - Console (`/console/*`) - Protected admin routes

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

# Database migrations
cd packages/mgmt_server
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

# Build
pnpm build

# Type check
pnpm tsc --noEmit

# Lint
pnpm lint

# Add shadcn/ui component
pnpm dlx shadcn@latest add <component>
```

## Environment Configuration

Copy `.env.example` to `.env.local` and configure:

- `ADMIN_EMAIL/PASSWORD/NAME`: Auto-created admin account
- `JWT_SECRET_KEY`: Required for token signing
- `PG_*`: PostgreSQL connection
- `REDIS_URL`: Redis connection
- `S3_*`: S3-compatible storage (MinIO, Ceph, AWS S3)
- `INCOMPLETE_FILE_PATH`: Temp download directory

Frontend environment (`frontend/.env`):
- `VITE_API_BASE_URL`: Management API base URL (e.g., `http://localhost:9800/api/v1`)

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
| `/configs/*` | System configuration |

### HF API (Port 9801)

HF Hub-compatible endpoints for `HF_ENDPOINT`:

| Endpoint | Purpose |
|----------|---------|
| `/api/models/{repo_id}/revision/{revision}` | Repo info |
| `/api/models/{repo_id}/tree/{revision}/{path}` | File tree |
| `/api/models/{repo_id}/resolve/{revision}/{filename}` | File download (redirects to S3 presigned URL) |

## Testing

Backend tests use pytest. Run specific test files:
```bash
uv run pytest packages/cache/tests/test_cache_service.py -v
```

## Key Files

- Database models: `packages/database/src/database/db_models/`
- API routes (mgmt): `packages/mgmt_server/src/mgmt_server/api/v1/endpoints/`
- API routes (HF): `packages/hf_server/src/hf_server/api/endpoints/`
- Worker handlers: `packages/worker/src/worker/handlers/`
- Frontend API client: `frontend/src/lib/api.ts`
- Frontend types: `frontend/src/lib/api-types.ts`
