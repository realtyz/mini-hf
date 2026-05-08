# Alembic Migration Upgrade Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 Alembic 迁移体系，使 autogenerate 能检测模型变更，并补全缺失的 `announcements` 表和 `tasks.retry_count` 列。

**Architecture:** 先修复 `env.py` 让 `--autogenerate` 能正确对比模型与数据库，再通过 autogenerate 生成两个新迁移文件（或者手动编写以确保精确控制），最后在本地数据库上执行迁移验证。

**Tech Stack:** Alembic, SQLAlchemy 2.0, PostgreSQL, uv workspace

**Background:** 当前 `alembic/env.py` 定义了一个独立的 `Base` 类（与 `database.db_models.base.Base` 完全无关），导致 `target_metadata` 为空 — `--autogenerate` 永远检测不到模型变更。此外，`Announcement` 模型和 `Task.retry_count` 字段在初始迁移之后加入，但没有对应的迁移脚本。

---

### Task 1: 修复 `env.py` 中的 target_metadata

**Files:**
- Modify: `alembic/env.py:1-98`

**问题：** `env.py` 第 22-25 行定义了一个裸的 `Base(DeclarativeBase)`，与真实模型的 `Base` 不是同一个注册表。`get_target_metadata()` 返回的是空的 metadata。

**Step 1: 替换 standalone Base 为真实导入**

将以下内容：
```python
# Standalone Base class - mirrors database.db_models.base.Base
# This avoids importing the database package in env.py
class Base(DeclarativeBase):
    """Base class for all models."""
    pass
```

替换为：
```python
from database.db_models import Base
```

同时移除非必需的 import：
- 删除 `from sqlalchemy.orm import DeclarativeBase`（如果不再被其他地方使用的话——事实上，`env.py` 只在这里用了它，所以可以安全删除。）

**Step 2: 验证 autogenerate 能否检测到差异**

```bash
cd d:/Workspace/mini-hf && uv run alembic revision --autogenerate -m "test-autogenerate"
```

预期结果：生成的迁移文件包含 `announcements` 表的创建和 `tasks.retry_count` 列的添加。

注意：此时不要提交这个临时迁移文件——它仅用于验证。验证通过后删除它。

**Step 3: 删除测试迁移文件**

```bash
rm alembic/versions/*test_autogenerate*.py
```

**Step 4: Commit**

```bash
git add alembic/env.py
git commit -m "fix: wire alembic env.py to real model Base for autogenerate"
```

---

### Task 2: 创建 `announcements` 表迁移

**Files:**
- Create: `alembic/versions/00002_add_announcements_table.py`
- Reference: `packages/database/src/database/db_models/announcement.py`

**Note:** `Announcement` 模型使用 `Enum(AnnouncementType, create_type=True)` 会创建 PostgreSQL 原生枚举类型。迁移中需显式处理。

**Step 1: 编写迁移文件**

```python
"""add announcements table

Revision ID: 00002
Revises: 00001
Create Date: 2026-05-08 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "00002"
down_revision: Union[str, Sequence[str], None] = "00001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create the enum type first
    announcement_type_enum = sa.Enum(
        "info", "warning", "urgent", name="announcement_type", create_type=True
    )
    announcement_type_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "announcements",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "announcement_type",
            announcement_type_enum,
            nullable=False,
            server_default="info",
        ),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        schema="mini_hf",
    )


def downgrade() -> None:
    op.drop_table("announcements", schema="mini_hf")
    sa.Enum(name="announcement_type").drop(op.get_bind(), checkfirst=True)
```

**Step 2: 验证迁移可以执行**

先确认当前数据库可达：
```bash
cd d:/Workspace/mini-hf && uv run alembic current
```

执行升级：
```bash
cd d:/Workspace/mini-hf && uv run alembic upgrade 00002
```

验证升级成功：
```bash
cd d:/Workspace/mini-hf && uv run alembic current
```

再测试回滚：
```bash
cd d:/Workspace/mini-hf && uv run alembic downgrade 00001
```

再升级回来：
```bash
cd d:/Workspace/mini-hf && uv run alembic upgrade 00002
```

**Step 3: Commit**

```bash
git add alembic/versions/00002_add_announcements_table.py
git commit -m "feat: add announcements table migration"
```

---

### Task 3: 创建 `tasks.retry_count` 列迁移

**Files:**
- Create: `alembic/versions/00003_add_tasks_retry_count.py`
- Reference: `packages/database/src/database/db_models/task.py:125-127`

**Step 1: 编写迁移文件**

```python
"""add retry_count column to tasks

Revision ID: 00003
Revises: 00002
Create Date: 2026-05-08 10:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "00003"
down_revision: Union[str, Sequence[str], None] = "00002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column(
            "retry_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment="自动重试次数",
        ),
        schema="mini_hf",
    )


def downgrade() -> None:
    op.drop_column("tasks", "retry_count", schema="mini_hf")
```

**Step 2: 验证迁移可以执行**

```bash
cd d:/Workspace/mini-hf && uv run alembic upgrade 00003 && uv run alembic current
```

测试回滚 + 重新升级：
```bash
cd d:/Workspace/mini-hf && uv run alembic downgrade 00002 && uv run alembic upgrade 00003 && uv run alembic current
```

**Step 3: Commit**

```bash
git add alembic/versions/00003_add_tasks_retry_count.py
git commit -m "feat: add retry_count column to tasks table"
```

---

### Task 4: 最终验证完整迁移链

**Step 1: 从头到尾测试完整迁移**

模拟全新数据库场景（如果本地有测试环境可用）：
```bash
cd d:/Workspace/mini-hf && uv run alembic downgrade base && uv run alembic upgrade head
```

确认最终状态：
```bash
cd d:/Workspace/mini-hf && uv run alembic current
```

预期输出：
```
00003 (head)
```

**Step 2: 验证表结构与模型一致**

用 psql 或 pgAdmin 检查关键表：
- `announcements` 表包含所有 7 个业务列 + id
- `tasks` 表包含 `retry_count` 列，类型为 INTEGER，默认值为 0

```bash
# One way: use alembic autogenerate to confirm zero diff
cd d:/Workspace/mini-hf && uv run alembic revision --autogenerate -m "verify-no-diff"
# Expected: migration file is empty (only pass in upgrade/downgrade)
rm alembic/versions/*verify_no_diff*.py
```

---

## Risks & Notes

1. **`create_type=True` 的枚举处理**：`announcement_type` 枚举在 downgrade 时会调用 `DROP TYPE`。如果数据库中已有该类型（例如因为之前模型使用了 `create_type=True` 且 `Base.metadata.create_all()` 被调用过），迁移的 `create()` 会因 `checkfirst=True` 安全跳过，而 downgrade 的 `drop()` 也不会报错（因为 `checkfirst=True`）。但如果 `announcements` 表中已有行，则 `DROP TYPE` 会失败——这是预期行为，防止误删正在使用的类型。

2. **数据库连接**：迁移需要在 `.env.local` 或环境变量中配置好 `PG_HOST`/`PG_PORT`/`PG_USERNAME`/`PG_PASSWORD`/`PG_DATABASE`。`env.py` 中 `get_database_url()` 函数优先读 `DATABASE_URL` 变量，若不存在则从各 PG_ 变量拼接。

3. **依赖链**：`00002 → 00003` 的依赖关系确保了迁移可以按正确的顺序执行。如果 `retry_count` 的迁移应该在 `announcements` 之前执行（独立性），也可以将 00003 的 `down_revision` 设为 `00001`，但保持线性链是最简单的。
