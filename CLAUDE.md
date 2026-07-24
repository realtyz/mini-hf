# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Quick Reference

### Essential Commands

```bash
# Backend (Python — uv workspace, all packages under packages/)
uv sync                                          # Install dependencies
uv run --env-file .env.local python -m mgmt_server.main --reload  # Management API (port 9800)
uv run --env-file .env.local python -m hf_server.main --reload    # HF API (port 9801)
uv run --env-file .env.local python -m ms_server.main --reload    # ModelScope API (port 9802)
uv run --env-file .env.local python -m worker.main                # Task worker
uv run alembic upgrade head                      # Run migrations (alembic.ini at repo root)
uv run pytest                                    # All tests
uv run pytest -k "test_name" -v                  # Single test by pattern
uv run pytest packages/cache/tests -v            # Single package tests
uvx ruff check .                                 # Lint (uvx, not uv run)
uvx ruff check --fix .                           # Auto-fix lint

# Frontend (React 19 SPA)
cd frontend && pnpm install && pnpm dev          # Start dev server
cd frontend && pnpm build                        # TypeScript check + production build
cd frontend && pnpm tsc --noEmit                 # Type-check only (no test runner exists)
cd frontend && pnpm lint                         # ESLint
```

### Architecture at a Glance

Three FastAPI servers + a worker, backed by PostgreSQL + Redis + S3:

```
mgmt_server (9800) / hf_server (9801) / ms_server (9802) / worker
       ↕                        ↕                        ↕          ↕
  database / cache / storage / services  ←  packages with src/ layout
       ↕
  core (settings.py — pydantic-settings singleton)
```

**All Python packages use `src/` layout**: imports look like `from core.settings import settings`, not `from packages.core.src.core.settings`.

**Database session**: use `unit_of_work()` (FastAPI dependency, auto-commit/rollback) or `new_session()` (manual, for workers/scripts). Never use the deprecated `get_db()` / `get_session()`.

**Config registry** is the single source of truth for system config keys: `packages/services/src/services/config/registry.py`. New config keys MUST be registered there.

**Tests use real PostgreSQL** (not SQLite in-memory). Async fixtures like `db_session` are in package-level `conftest.py` files, using `pytest-asyncio`.

### Key Behavioral Rules

These override default behavior — read before making changes:

1. **Think before coding** — surface assumptions, present tradeoffs, ask when unclear.
2. **Simplicity first** — minimum code, no speculative features, no single-use abstractions.
3. **Surgical changes** — touch only what you must, match existing style, don't "improve" adjacent code.
4. **Goal-driven execution** — define verifiable success criteria, loop until verified.
5. **Confirm before deleting/renaming files** — the structure is stable.
6. **Match existing patterns** — new API hook follows `use-repo-queries.ts`; new page follows an existing page layout.
7. **Don't add dependencies** without asking.
8. **UI text is in Chinese** (toast messages, labels, error text).

Detailed architecture, API structure, environment config, and full conventions are in [AGENTS.md](AGENTS.md). Frontend-specific conventions (TanStack Query patterns, naming rules, layout/z-index rules) are in [frontend/AGENTS.md](frontend/AGENTS.md).
