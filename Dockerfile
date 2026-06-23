# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the mini-hf backend image.
# - Stage 1 (builder) installs deps with uv and produces /app/.venv.
# - Stage 2 (runtime) is a slim image with just the venv + sources + uv.
#
# The same image is reused for mgmt_server, hf_server, and worker —
# docker-compose overrides CMD per service.

# =============================================================================
# Stage 1: builder
# =============================================================================
FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# UV_LINK_MODE=copy — venv stays portable when copied to the runtime stage.
# UV_COMPILE_BYTECODE=1 — precompile .pyc once, faster cold start in runtime.
# UV_NO_DEV=1 / UV_FROZEN=1 — production install from the locked manifest.
ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_NO_DEV=1 \
    UV_FROZEN=1

WORKDIR /app

# --- Step 1: install external dependencies only ---
# Copy only the manifests so this layer stays cached when source changes but
# deps don't. --no-install-workspace skips the local workspace members
# (their source isn't here yet). README files are included because each
# package's pyproject.toml declares `readme = "README.md"`, which uv may try
# to read when validating workspace member metadata.
COPY pyproject.toml uv.lock ./
COPY packages/core/pyproject.toml        packages/core/README.md        packages/core/
COPY packages/cache/pyproject.toml       packages/cache/README.md       packages/cache/
COPY packages/database/pyproject.toml    packages/database/README.md    packages/database/
COPY packages/storage/pyproject.toml     packages/storage/README.md     packages/storage/
COPY packages/services/pyproject.toml    packages/services/README.md    packages/services/
COPY packages/mgmt_server/pyproject.toml packages/mgmt_server/README.md packages/mgmt_server/
COPY packages/hf_server/pyproject.toml   packages/hf_server/README.md   packages/hf_server/
COPY packages/worker/pyproject.toml      packages/worker/README.md      packages/worker/

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --all-packages --no-install-workspace

# --- Step 2: install workspace packages ---
# Source-only changes invalidate this layer but keep the deps layer above.
COPY packages/ packages/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --all-packages

# =============================================================================
# Stage 2: runtime
# =============================================================================
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    UV_NO_SYNC=1 \
    UV_FROZEN=1 \
    UV_NO_DEV=1

# Keep uv in the runtime image so the `uv run ...` commands in
# docker-compose.yml continue to work. UV_NO_SYNC=1 makes them skip the
# implicit sync step and just exec inside the already-built venv.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy the prebuilt venv. Editable installs of workspace members reference
# /app/packages/*/src, so we copy that directory at the same path.
COPY --from=builder /app/.venv /app/.venv
COPY pyproject.toml uv.lock alembic.ini ./
COPY alembic/ ./alembic/
COPY packages/ ./packages/

EXPOSE 9800 9801

# Default to mgmt_server; docker-compose overrides per service.
CMD ["python", "-m", "mgmt_server.main", "--host", "0.0.0.0", "--port", "9800"]
