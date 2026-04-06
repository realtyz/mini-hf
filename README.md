# Mini-HF

Mini-HF 是一个面向局域网环境的模型缓存仓库系统，用于缓存和管理 HuggingFace / ModelScope 的模型与数据集。通过提供与 HuggingFace Hub 兼容的 API 接口，它能够让局域网内的机器将 `HF_ENDPOINT` 指向本地服务器，从而加速模型与数据集的下载，同时减少外网带宽消耗。

---

## 核心特性

- **HF API 兼容**：提供与 HuggingFace Hub 兼容的文件下载接口（`/api/*`），支持 `HF_ENDPOINT` 无缝切换。
- **增量同步**：支持仓库的增量更新，只下载发生变更的文件，显著提升更新效率。
- **任务队列**：基于 PostgreSQL 的任务队列，支持下载任务的生命周期管理（提交 → 审核 → 运行 → 完成 / 失败 / 取消）。
- **Redis 缓存**：用于实时进度追踪、文件级状态管理和预览数据缓存。
- **S3 对象存储**：下载的文件最终存储于 S3 兼容的对象存储中，文件访问通过预签名 URL 302 重定向返回。
- **多版本管理**：同一仓库的同一 revision 仅保留最新活跃快照，旧版本自动归档，避免存储冗余。
- **Web 管理后台**：基于 React + Tailwind CSS 的控制台，支持仓库浏览、任务管理、配置管理和进度实时查看。

---

## 系统架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React 前端     │────▶│  Management API │────▶│   PostgreSQL    │
│  (Port 5173)    │     │   (Port 9800)   │     │    (任务/元数据)  │
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
                        │   S3 存储       │     │     Redis       │
                        │  (预签名URL)     │     │ (缓存/进度追踪)  │
                        └─────────────────┘     └─────────────────┘
                               ▲
                               │
                        ┌─────────────────┐
                        │     Worker      │◀──── 轮询 PostgreSQL 任务队列
                        │  (任务处理器)    │       执行模型下载与上传
                        └─────────────────┘
```

### 后端包结构

| 包名 | 职责 |
|------|------|
| `packages/core` | 配置管理 |
| `packages/database` | SQLAlchemy 异步模型与数据访问层 |
| `packages/cache` | Redis 缓存与进度追踪 |
| `packages/storage` | S3 兼容客户端（基于 boto3） |
| `packages/huggingface` | HuggingFace Hub API 客户端封装 |
| `packages/task` | PostgreSQL 任务队列客户端 |
| `packages/worker` | 下载/上传任务处理器 |
| `packages/hf_server` | HF 兼容 API 服务器（Port 9801） |
| `packages/mgmt_server` | 管理 API 服务器（Port 9800） |

---

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 20+ & pnpm
- PostgreSQL 15+
- Redis 7+
- S3 兼容的对象存储（如 MinIO、Ceph、AWS S3）

### 1. 克隆项目并安装依赖

```bash
# 克隆仓库
git clone <repo-url>
cd mini-hf

# 安装 Python 依赖
uv sync

# 安装前端依赖
cd frontend
pnpm install
cd ..
```

### 2. 配置环境变量

复制并编辑环境变量文件：

```bash
cp .env.example .env.local
```

关键配置项：

```env
# 管理员账户（首次启动自动创建）
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change_me
ADMIN_NAME=admin

# JWT
JWT_SECRET_KEY=your-secret-key
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60

# PostgreSQL
PG_HOST=localhost
PG_PORT=5432
PG_USERNAME=mini_hf
PG_PASSWORD=mini_hf
PG_DATABASE=mini_hf

# Redis
REDIS_URL=redis://localhost:6379/0

# S3
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET_NAME=mini-hf
S3_REGION=us-east-1
S3_USE_SSL=false
S3_VERIFY_SSL=false

# 临时下载目录
INCOMPLETE_FILE_PATH=/tmp/mini-hf-downloads
```

前端环境变量（`frontend/.env`）：

```env
VITE_API_BASE_URL=http://localhost:9800/api/v1
```

### 3. 初始化数据库

```bash
cd packages/mgmt_server
uv run alembic upgrade head
cd ../..
```

### 4. 启动服务

**后端服务（建议分别启动在不同终端）：**

```bash
# 管理 API 服务器
uv run --env-file .env.local python -m mgmt_server.main --reload

# HF 兼容 API 服务器
uv run --env-file .env.local python -m hf_server.main --reload

# 任务处理器（Worker）
uv run --env-file .env.local python -m worker.main
```

**前端开发服务器：**

```bash
cd frontend
pnpm dev
```

访问前端：`http://localhost:5173`

---

## 使用方式

### 在管理后台添加仓库

1. 打开 Web 控制台，登录管理员账户。
2. 进入「仓库管理」，添加需要缓存的 HuggingFace 仓库 ID（如 `bert-base-uncased`）。
3. 提交同步任务，等待 Worker 完成文件下载。
4. 仓库状态变为 `ACTIVE` 后，局域网内的客户端即可通过 HF API 访问。

### 客户端使用本地缓存

将 `HF_ENDPOINT` 环境变量指向本地 HF 服务器：

```bash
export HF_ENDPOINT=http://localhost:9801
```

然后正常使用 `huggingface_hub` 或 Transformers 库加载模型：

```python
from transformers import AutoModel

model = AutoModel.from_pretrained("bert-base-uncased")
```

文件请求会被重定向到本地 S3 的预签名 URL，实现局域网内的高速下载。

---

## 开发说明

### 常用命令

```bash
# 运行测试
uv run pytest

# 运行指定测试
uv run pytest packages/cache/tests/test_cache_service.py -v

# 创建数据库迁移
cd packages/mgmt_server
uv run alembic revision --autogenerate -m "描述"

# 应用迁移
uv run alembic upgrade head

# 前端类型检查
cd frontend
pnpm tsc --noEmit

# 添加 shadcn/ui 组件
pnpm dlx shadcn@latest add <component>
```

### 任务生命周期

```
PENDING_APPROVAL ──▶ PENDING ──▶ RUNNING ──▶ COMPLETED
                                    │
                                    ▼
                              FAILED / CANCELLED
```

- 任务默认需要管理员审核后才会进入运行状态。
- Worker 通过 `FOR UPDATE SKIP LOCKED` 安全地并发消费任务。
- 支持 graceful 取消：设置 `CANCELING` 状态后，Worker 会安全停止当前任务。

---

## License

[MIT](LICENSE)
