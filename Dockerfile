# Multi-Service Dockerfile for mini-hf
# 复用于 mgmt_server, hf_server, worker
# 参考: https://docs.astral.sh/uv/guides/integration/docker/

FROM python:3.12-slim

# 从官方镜像复制 uv 二进制文件
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# 设置工作目录
WORKDIR /app

ENV UV_NO_DEV=1

# 复制 workspace 配置
COPY pyproject.toml ./
COPY uv.lock ./
COPY alembic.ini ./
COPY alembic/ ./alembic/

# 复制 packages
COPY packages/core/ packages/core/
COPY packages/cache/ packages/cache/
COPY packages/database/ packages/database/
COPY packages/storage/ packages/storage/
COPY packages/services/ packages/services/
COPY packages/mgmt_server/ packages/mgmt_server/
COPY packages/hf_server/ packages/hf_server/
COPY packages/worker/ packages/worker/

# 创建虚拟环境并安装所有依赖
# 不使用 workspace 模式，直接逐个安装包
RUN uv venv && \
    . .venv/bin/activate && \
    uv pip install -e packages/core && \
    uv pip install -e packages/cache && \
    uv pip install -e packages/database && \
    uv pip install -e packages/storage && \
    uv pip install -e packages/services && \
    uv pip install -e packages/mgmt_server && \
    uv pip install -e packages/hf_server && \
    uv pip install -e packages/worker && \
    uv pip install alembic psycopg2-binary loguru

# 暴露两个服务端口（worker 不需要端口）
EXPOSE 9800 9801

# 使用虚拟环境中的 python
ENV PATH="/app/.venv/bin:$PATH"

# 默认启动 mgmt_server（可在 compose 中覆盖）
CMD ["python", "-m", "mgmt_server.main", "--host", "0.0.0.0", "--port", "9800"]
