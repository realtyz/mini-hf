# Multi-Service Dockerfile for mini-hf
# 复用于 mgmt_server, hf_server, worker
# 参考: https://docs.astral.sh/uv/guides/integration/docker/

FROM python:3.12-slim

# 从官方镜像复制 uv 二进制文件
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# 启用字节码编译以提升应用启动速度
ENV UV_COMPILE_BYTECODE=1

# 将 uv 缓存挂载到缓存卷以加速构建
ENV UV_LINK_MODE=copy

ENV UV_NO_DEV=1

# 设置工作目录
WORKDIR /app

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

RUN uv sync --locked

# 暴露两个服务端口（worker 不需要端口）
EXPOSE 9800 9801

# 默认启动 mgmt_server（可在 compose 中覆盖）
CMD ["uv", "run", "python", "-m", "mgmt_server.main", "--host", "0.0.0.0", "--port", "9800"]
