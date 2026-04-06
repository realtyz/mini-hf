# Mini-HF

A LAN-focused model cache repository system for HuggingFace and ModelScope. Mini-HF provides HF Hub-compatible APIs to accelerate model downloads within your local network while reducing external bandwidth usage.

## Features

- **HF Hub Compatible** — Drop-in replacement for `HF_ENDPOINT` with full API compatibility
- **Multi-Source Support** — Cache models from both HuggingFace and ModelScope
- **Smart Version Management** — Automatically track model revisions with incremental updates
- **Web Management UI** — Modern React-based dashboard for repository and task management
- **Distributed Architecture** — Scalable worker pool for parallel model downloads
- **S3-Compatible Storage** — Store models in MinIO, Ceph, AWS S3, or other S3-compatible backends
- **Task Queue** — PostgreSQL-backed job queue with retry and progress tracking
- **Docker Ready** — Complete containerized deployment with Docker Compose


## Quick Start

### Prerequisites

- Docker and Docker Compose
- (Optional) Python 3.12+ for local development

### Docker Deployment

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/mini-hf.git
   cd mini-hf
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your settings (S3 credentials, admin password, etc.)
   ```

3. **Start all services**
   ```bash
   docker-compose up -d
   ```

4. **Access the services**
   - Web UI: http://localhost
   - Management API: http://localhost:9800/api/v1
   - HF API: http://localhost:9801

5. **Use with HuggingFace**
   ```bash
   export HF_ENDPOINT=http://localhost:9801
   huggingface-cli download bert-base-uncased
   ```

## Development Setup

### Backend

The backend is organized as a uv workspace with multiple packages:

```bash
# Install dependencies
uv sync

# Run database migrations
cd packages/mgmt_server
uv run alembic upgrade head

# Start management API server
uv run --env-file .env.local python -m mgmt_server.main --reload

# Start HF API server (in another terminal)
uv run --env-file .env.local python -m hf_server.main --reload

# Start worker (in another terminal)
uv run --env-file .env.local python -m worker.main
```

### Frontend

```bash
cd frontend

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DEFAULT_ADMIN_EMAIL` | Admin user email (auto-created on first startup) | `admin@example.com` |
| `DEFAULT_ADMIN_PASSWORD` | Admin user password (auto-created on first startup) | `changeme` |
| `JWT_SECRET_KEY` | Secret key for JWT signing | *(required)* |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | JWT access token expiration time in minutes | `30` |
| `JWT_ALGORITHM` | JWT signing algorithm | `HS256` |
| `CONFIG_ENCRYPTION_KEY` | Encryption key for sensitive config values (falls back to JWT_SECRET_KEY if not set) | *optional* |
| `PG_HOST` | PostgreSQL host | *(required)* |
| `PG_PORT` | PostgreSQL port | *(required)* |
| `PG_USERNAME` | PostgreSQL username | *(required)* |
| `PG_PASSWORD` | PostgreSQL password | *(required)* |
| `PG_DATABASE` | PostgreSQL database name | *(required)* |
| `APP_NAME` | Application name | *(required)* |
| `DEBUG` | Debug mode | `false` |
| `REDIS_URL` | Redis connection URL | *(required)* |
| `S3_ENDPOINT` | S3-compatible storage endpoint | *(required)* |
| `S3_ACCESS_KEY` | S3 access key | *(required)* |
| `S3_SECRET_KEY` | S3 secret key | *(required)* |
| `S3_BUCKET_NAME` | S3 bucket name | *(required)* |
| `S3_REGION` | S3 region | `us-east-1` |
| `S3_USE_SSL` | Use SSL for S3 connection | `false` |
| `S3_VERIFY_SSL` | Verify SSL certificate for S3 | `false` |
| `INCOMPLETE_FILE_PATH` | Temp download directory | *(required)* |

### Frontend Environment

Create `frontend/.env`:

```bash
VITE_API_BASE_URL=http://localhost:9800/api/v1
```

## API Reference

### Management API (Port 9800)

Base: `/api/v1`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/login` | POST | JWT login |
| `/auth/refresh` | POST | Refresh access token |
| `/user/me` | GET | Current user info |
| `/repos` | GET/POST | List/create repositories |
| `/tasks` | GET/POST | List/create tasks |
| `/configs` | GET/PUT | System configuration |
| `/health` | GET | Health check |

### HF-Compatible API (Port 9801)

| Endpoint | Description |
|----------|-------------|
| `/api/models/{repo_id}/revision/{revision}` | Get repository info |
| `/api/models/{repo_id}/tree/{revision}/{path}` | List file tree |
| `/api/models/{repo_id}/resolve/{revision}/{filename}` | Download file (redirects to S3) |

## Project Structure

```
mini-hf/
├── packages/                 # Python backend packages (uv workspace)
│   ├── core/                # Configuration management
│   ├── database/            # SQLAlchemy models and repositories
│   ├── cache/               # Redis cache client
│   ├── storage/             # S3-compatible storage client
│   ├── services/            # HuggingFace/ModelScope clients
│   ├── mgmt_server/         # Management API (FastAPI)
│   ├── hf_server/           # HF-compatible API (FastAPI)
│   └── worker/              # Task processor
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── components/      # UI components (shadcn/ui)
│   │   ├── pages/           # Route pages
│   │   ├── lib/             # API client and utilities
│   │   └── router.tsx       # Route definitions
│   └── package.json
├── docker-compose.yml        # Docker deployment
├── Dockerfile               # Backend Docker image
└── pyproject.toml           # Python workspace configuration
```

## Key Concepts

### Repository

A repository represents a model from HuggingFace or ModelScope. Each repository has:
- **Repo ID** — The source identifier (e.g., `bert-base-uncased`)
- **Source** — Either `huggingface` or `modelscope`
- **Revisions** — Version tags or branches (e.g., `main`, `v1.0`)

### Snapshot Status

- `INACTIVE` — New snapshot, files not fully downloaded
- `ACTIVE` — Current commit for a revision (latest), files complete
- `ARCHIVED` — Previous active commit, kept for metadata

### Task Lifecycle

Tasks flow through the following states:
```
PENDING_APPROVAL → PENDING → RUNNING → COMPLETED
                                      ↘ FAILED
                                      ↘ CANCELLED
```

## Testing

```bash
# Run all tests
uv run pytest

# Run specific package tests
uv run pytest packages/database/tests -v
uv run pytest packages/cache/tests -v
```

## License

MIT License — See [LICENSE](LICENSE) for details.
