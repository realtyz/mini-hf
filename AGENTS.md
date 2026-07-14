# AGENTS.md

Workspace guide for ZCode agents working in `mini-hf`. Keep this short — for depth, read the files it points to.

## What this is

Mini-HF is a LAN-focused model cache for HuggingFace / ModelScope. It exposes Hub-compatible APIs (`HF_ENDPOINT` for HuggingFace, `MODELSCOPE_ENDPOINT` for ModelScope) so clients on an air-gapped LAN download models through a local cache instead of hitting upstream. Worker nodes need internet access to pull from upstream the first time; subsequent downloads use the cache.

Three FastAPI servers + a worker, backed by PostgreSQL + Redis + S3-compatible storage. React 19 SPA frontend.

## Read these first (depth lives here)

- `CLAUDE.md` (root) — backend architecture, package dependency chain, worker 6-phase workflow, auth, config registry. **Authoritative for backend.**
- `frontend/CLAUDE.md` — frontend conventions, naming rules, TanStack Query patterns, layout/z-index rules. **Authoritative for frontend.**
- `docs/plans/frontend-code-review-2026-06.md` — recent code-quality audit (P1/P2 findings, all fixed). Good context before frontend refactors.

## Layout

```
packages/          # uv workspace — backend (Python 3.12, FastAPI, async SQLAlchemy)
  core/            #   settings (pydantic-settings) — single Settings class
  database/        #   models (db_models/), repositories (db_repositories/), session core.py
  cache/           #   Redis client + progress tracking
  storage/         #   S3 client (boto3)
  services/        #   HF/ModelScope/task/config/email services + config registry
  mgmt_server/     #   Management API — port 9800, base /api/v1
  hf_server/       #   HF-compatible API — port 9801
  ms_server/       #   ModelScope-compatible API - port 9802
  worker/          #   Task processor (custom poll loop, not FastAPI)
frontend/          # React 19 SPA (Vite 7, pnpm)
alembic/           # DB migrations (alembic.ini at repo root)
docs/plans/        # design notes / audits
```

**Backend dependency chain**: `mgmt_server` / `hf_server` / `ms_server` / `worker` → `database` / `cache` / `storage` / `services` → `core`. Don't introduce cycles. Each server + the worker depend on the infrastructure packages, which all depend on `core`.

## Commands

Backend (run from repo root, `uv`):

```bash
uv sync                                              # install deps
uv run --env-file .env.local python -m mgmt_server.main --reload   # mgmt API (9800)
uv run --env-file .env.local python -m hf_server.main --reload    # HF API (9801)
uv run --env-file .env.local python -m ms_server.main --reload     # MS API (9802)
uv run --env-file .env.local python -m worker.main                # worker
uv run alembic upgrade head                          # apply migrations
uv run alembic revision --autogenerate -m "desc"     # new migration
uv run pytest                                        # all tests
uv run pytest packages/database/tests -v             # one package
uv run ruff check .                                  # lint
uv run ruff check --fix .                            # lint --fix
```

Frontend (run from `frontend/`):

```bash
pnpm install
pnpm dev                # Vite dev server
pnpm build              # tsc -b && vite build — typecheck IS part of build
pnpm lint               # eslint
pnpm tsc --noEmit       # typecheck only (no test harness exists)
```

There is **no frontend test runner**. Safety net is `pnpm tsc --noEmit` + `pnpm lint`. Prefer pure functions for non-trivial logic.

## Conventions that bite

- **DB sessions**: use `unit_of_work()` via `Depends(unit_of_work)` in FastAPI (commits on success, rolls back on exception). Use `new_session()` only in non-FastAPI contexts (worker, scripts). `get_db()` / `get_session()` are **deprecated** — don't use in new code. (`packages/database/src/database/core.py`)
- **Config registry** (`packages/services/src/services/config/registry.py`) is the single source of truth for system config keys. New keys must be registered here; the `/config/schema` endpoint reads from it to build the settings UI. Sensitive keys are AES-encrypted at rest.
- **Alembic `env.py`** builds the DB URL from `PG_*` env vars directly (not from `settings.py`), so migrations need `PG_*` set in the environment.
- **Worker tuning knobs** are all in `packages/core/src/core/settings.py` (`Settings` class) — `WORKER_*` fields. Import via `from core.settings import settings`.
- **Snapshot/Repo/Task status enums** live in `packages/database/src/database/db_models/enums.py`. Multi-version rule: each revision keeps exactly one `ACTIVE` snapshot; old commits → `ARCHIVED`.
- **Frontend query keys** always go through the `queryKeys` factory in `frontend/src/lib/query/keys.ts`. Never inline `['tasks', 'list']`.
- **Frontend exports**: components use named exports only. Page entry files (`pages/**/index.tsx`) and a few non-component lib modules (`lib/api/client.ts`, `lib/api/endpoints.ts`) are the only default-export exceptions.
- **UI text is in Chinese** (toasts, labels, errors). Keep consistent.
- **Frontend overlays**: use Radix/shadcn portal components (Dialog/Sheet/Popover/...) for global overlays — they escape `main`'s `z-10` stacking context. Don't hand-roll `z-[9999]` inside a page. Page-decorative backgrounds belong in `ConsoleLayout`, not individual pages.
- **Path alias `@docs/`** is configured in root `tsconfig.json` but **not** in `tsconfig.app.json`; unused inside `src/` today. If you import from `docs/` in app code, add the alias to `tsconfig.app.json`.

## Operational gotchas

- **S3 is a required external dependency** — not shipped in `docker-compose.yml`. Bucket must already exist. `localhost` for `S3_ENDPOINT` won't work from inside a container; use the host's LAN IP / DNS name.
- **`APP_HF_SERVER_URL`** is the public URL of the HF API server used in pagination links and download URLs returned to HF clients. Must be reachable from the LAN — not `localhost` in production. Likewise **`APP_MS_SERVER_URL`** / `MS_SERVER_URL` (port 9802) is the public URL of the ModelScope API server, surfaced to docs/clients as `{{MS_ENDPOINT}}` / `MODELSCOPE_ENDPOINT`.
- Local dev uses `.env.local` (backend) and `frontend/.env` (`APP_API_BASE_URL`). `.env.example` is the template.
- Python is pinned `>=3.12,<3.13`. PyPI index is set to Tsinghua mirror in `pyproject.toml`.

## Behavioral rules

These apply repo-wide (see `CLAUDE.md` §Behavioral Guidelines for the full version):

1. **Confirm before deleting or renaming files** — the structure is stable; surface proposed delete/rename and get the user's OK first.
2. **Surgical changes** — touch only what the task requires; don't refactor adjacent code or "clean up" while fixing a bug.
3. **Match existing patterns** — new API hook follows `use-repo-queries.ts`; new page follows an existing page layout.
4. **Don't add dependencies** without asking. Both backend and frontend dependency sets are stable.
5. State assumptions before implementing; ask when multiple interpretations exist.
