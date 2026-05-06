# Multi-Announcement + LandingPage UI — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace single-announcement config with a DB-backed multi-announcement system under `/api/v1/system`, and enhance LandingPage UI design.

**Architecture:** New `Announcement` model → `system.py` endpoint (public + admin CRUD) → frontend multi-banner UI. Table auto-created via `Base.metadata.create_all` on startup.

**Tech Stack:** SQLAlchemy async, FastAPI, React 19 + TanStack Query + Tailwind CSS 4 + Framer Motion

---

### Task 1: Create Announcement SQLAlchemy Model

**Files:**
- Create: `packages/database/src/database/db_models/announcement.py`
- Modify: `packages/database/src/database/db_models/__init__.py`
- Modify: `packages/database/src/database/__init__.py`

**Step 1: Create the model file**

```python
"""Announcement model for system-wide notifications."""

import enum
from datetime import datetime
from sqlalchemy import String, Text, Boolean, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from database.db_models.base import Base


class AnnouncementType(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    URGENT = "urgent"


class Announcement(Base):
    __tablename__ = "announcements"
    __table_args__ = {"schema": "mini_hf"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    announcement_type: Mapped[AnnouncementType] = mapped_column(
        Enum(AnnouncementType, name="announcement_type", create_type=True),
        nullable=False,
        default=AnnouncementType.INFO,
    )
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(), onupdate=lambda: datetime.now()
    )
```

**Step 2: Register in model `__init__.py`**

Add to `packages/database/src/database/db_models/__init__.py`:
```python
from database.db_models.announcement import Announcement, AnnouncementType
```
And add to `__all__` list.

**Step 3: Export from database package**

Add to `packages/database/src/database/__init__.py`:
```python
from database.db_models import Announcement
```

**Step 4: Commit**

```bash
git add packages/database/src/database/db_models/announcement.py \
        packages/database/src/database/db_models/__init__.py \
        packages/database/src/database/__init__.py
git commit -m "feat: add Announcement model for multi-announcement system"
```

---

### Task 2: Add create_all to Server Startup

**Files:**
- Modify: `packages/mgmt_server/src/mgmt_server/main.py`

**Step 1: Add import and create_all call in lifespan**

In `main.py`, add import:
```python
from database.db_models.base import Base
from database import engine
```

In the lifespan startup section, add after `init_db()`:
```python
async with engine.begin() as conn:
    await conn.run_sync(Base.metadata.create_all)
```

**Step 2: Commit**

```bash
git add packages/mgmt_server/src/mgmt_server/main.py
git commit -m "feat: auto-create database tables on startup"
```

---

### Task 3: Create Announcement Schemas

**Files:**
- Modify: `packages/mgmt_server/src/mgmt_server/api/v1/schemas/configs.py`
- Modify: `packages/mgmt_server/src/mgmt_server/api/v1/schemas/__init__.py`

**Step 1: Add announcement schemas to configs.py**

Add these Pydantic models:

```python
from datetime import datetime

class AnnouncementCreateRequest(BaseModel):
    """Announcement create request schema."""
    title: str | None = Field(None, max_length=255)
    content: str = Field(..., min_length=1)
    announcement_type: Literal["info", "warning", "urgent"] = Field(default="info")
    is_pinned: bool = Field(default=False)
    is_active: bool = Field(default=True)


class AnnouncementUpdateRequest(BaseModel):
    """Announcement update request schema (all fields optional)."""
    title: str | None = Field(None, max_length=255)
    content: str | None = Field(None, min_length=1)
    announcement_type: Literal["info", "warning", "urgent"] | None = None
    is_pinned: bool | None = None
    is_active: bool | None = None


class AnnouncementResponse(BaseModel):
    """Announcement response schema."""
    id: int
    title: str | None
    content: str
    announcement_type: Literal["info", "warning", "urgent"]
    is_pinned: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, announcement) -> "AnnouncementResponse":
        return cls(
            id=announcement.id,
            title=announcement.title,
            content=announcement.content,
            announcement_type=announcement.announcement_type.value
            if hasattr(announcement.announcement_type, "value")
            else announcement.announcement_type,
            is_pinned=announcement.is_pinned,
            is_active=announcement.is_active,
            created_at=announcement.created_at,
            updated_at=announcement.updated_at,
        )
```

Update the existing `AnnouncementConfigResponse` comment to mark as deprecated:
```python
# [DEPRECATED] Use AnnouncementResponse from system endpoint instead.
class AnnouncementConfigResponse(BaseModel): ...
```

**Step 2: Commit**

```bash
git add packages/mgmt_server/src/mgmt_server/api/v1/schemas/configs.py
git commit -m "feat: add multi-announcement request/response schemas"
```

---

### Task 4: Create System Endpoint with CRUD

**Files:**
- Create: `packages/mgmt_server/src/mgmt_server/api/v1/endpoints/system.py`
- Modify: `packages/mgmt_server/src/mgmt_server/api/v1/router.py`

**Step 1: Create the endpoint file**

```python
"""System endpoints: announcements, health, etc."""

from fastapi import APIRouter, HTTPException
from sqlalchemy import select, desc

from database import AsyncSession, new_session
from database.db_models.announcement import Announcement
from mgmt_server.api.deps import DbDep, AdminUserDep
from mgmt_server.api.v1.schemas.base import BaseResponse
from mgmt_server.api.v1.schemas.configs import (
    AnnouncementCreateRequest,
    AnnouncementUpdateRequest,
    AnnouncementResponse,
)

router = APIRouter()


# ------------------------------------------------------------------
# Public endpoints (no auth)
# ------------------------------------------------------------------


@router.get(
    "/announcements",
    response_model=BaseResponse[list[AnnouncementResponse]],
)
async def list_public_announcements(
    db: DbDep,
) -> BaseResponse[list[AnnouncementResponse]]:
    """List active announcements. Pinned first, then newest first. No auth required."""
    result = await db.execute(
        select(Announcement)
        .where(Announcement.is_active == True)
        .order_by(desc(Announcement.is_pinned), desc(Announcement.created_at))
    )
    announcements = result.scalars().all()
    return BaseResponse[list[AnnouncementResponse]](
        data=[AnnouncementResponse.from_model(a) for a in announcements]
    )


@router.get(
    "/announcements/{announcement_id}",
    response_model=BaseResponse[AnnouncementResponse],
)
async def get_public_announcement(
    announcement_id: int,
    db: DbDep,
) -> BaseResponse[AnnouncementResponse]:
    """Get a single active announcement by ID. No auth required."""
    announcement = await db.get(Announcement, announcement_id)
    if not announcement or not announcement.is_active:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return BaseResponse[AnnouncementResponse](
        data=AnnouncementResponse.from_model(announcement)
    )


# ------------------------------------------------------------------
# Admin endpoints (require auth)
# ------------------------------------------------------------------


@router.post(
    "/announcements",
    response_model=BaseResponse[AnnouncementResponse],
    status_code=201,
)
async def create_announcement(
    admin: AdminUserDep,
    db: DbDep,
    request: AnnouncementCreateRequest,
) -> BaseResponse[AnnouncementResponse]:
    """Create a new announcement. Admin only."""
    announcement = Announcement(
        title=request.title,
        content=request.content,
        announcement_type=request.announcement_type,
        is_pinned=request.is_pinned,
        is_active=request.is_active,
    )
    db.add(announcement)
    await db.flush()
    await db.refresh(announcement)
    return BaseResponse[AnnouncementResponse](
        data=AnnouncementResponse.from_model(announcement)
    )


@router.put(
    "/announcements/{announcement_id}",
    response_model=BaseResponse[AnnouncementResponse],
)
async def update_announcement(
    announcement_id: int,
    admin: AdminUserDep,
    db: DbDep,
    request: AnnouncementUpdateRequest,
) -> BaseResponse[AnnouncementResponse]:
    """Update an announcement. Admin only."""
    announcement = await db.get(Announcement, announcement_id)
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")

    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(announcement, key, value)

    await db.flush()
    await db.refresh(announcement)
    return BaseResponse[AnnouncementResponse](
        data=AnnouncementResponse.from_model(announcement)
    )


@router.delete(
    "/announcements/{announcement_id}",
    response_model=BaseResponse,
)
async def delete_announcement(
    announcement_id: int,
    admin: AdminUserDep,
    db: DbDep,
) -> BaseResponse:
    """Delete an announcement. Admin only."""
    announcement = await db.get(Announcement, announcement_id)
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    await db.delete(announcement)
    await db.flush()
    return BaseResponse(message="Announcement deleted")
```

**Step 2: Register system router in v1 router**

In `router.py`, add import and registration:
```python
from mgmt_server.api.v1.endpoints import system
# ...
api_router.include_router(system.router, prefix="/system", tags=["System"])
```

**Step 3: Commit**

```bash
git add packages/mgmt_server/src/mgmt_server/api/v1/endpoints/system.py \
        packages/mgmt_server/src/mgmt_server/api/v1/router.py
git commit -m "feat: add /api/v1/system endpoint with announcement CRUD"
```

---

### Task 5: Backward Compat — Update Old Health Endpoint

**Files:**
- Modify: `packages/mgmt_server/src/mgmt_server/api/v1/endpoints/health.py`

**Step 1: Rewrite health announcement to query new table**

Replace the `get_public_announcement` function in `health.py`:

```python
from database.db_models.announcement import Announcement
from sqlalchemy import select, desc

@router.get("/announcement", response_model=BaseResponse[AnnouncementConfigResponse])
async def get_public_announcement(
    db: Annotated[AsyncSession, Depends(unit_of_work)],
) -> BaseResponse[AnnouncementConfigResponse]:
    """[DEPRECATED] Use GET /system/announcements instead.
    
    Returns the most recent active announcement for backward compatibility.
    """
    result = await db.execute(
        select(Announcement)
        .where(Announcement.is_active == True)
        .order_by(desc(Announcement.created_at))
        .limit(1)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        return BaseResponse[AnnouncementConfigResponse](data=None)
    return BaseResponse[AnnouncementConfigResponse](
        data=AnnouncementConfigResponse(
            content=announcement.content,
            announcement_type=announcement.announcement_type
            if isinstance(announcement.announcement_type, str)
            else announcement.announcement_type.value,
            is_active=announcement.is_active,
        )
    )
```

Note: need to add `AsyncSession` and `unit_of_work` imports, and add `Annotated` + `Depends`.

**Step 2: Commit**

```bash
git add packages/mgmt_server/src/mgmt_server/api/v1/endpoints/health.py
git commit -m "refactor: migrate health announcement to new Announcement table"
```

---

### Task 6: Frontend — Update API Types

**Files:**
- Modify: `frontend/src/lib/api-types.ts`

**Step 1: Add new announcement types**

Add to `api-types.ts`:

```typescript
// ==================== 公告（新系统） ====================

export type AnnouncementType = 'info' | 'warning' | 'urgent'

export interface AnnouncementItem {
  id: number
  title: string | null
  content: string
  announcement_type: AnnouncementType
  is_pinned: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/api-types.ts
git commit -m "feat: add AnnouncementItem type for multi-announcement system"
```

---

### Task 7: Frontend — API Hook for Public Announcements

**Files:**
- Modify: `frontend/src/hooks/api/use-config-queries.ts`

**Step 1: Add `usePublicAnnouncements` hook**

```typescript
import type { AnnouncementItem } from '@/lib/api-types'

export function usePublicAnnouncements() {
  return useQuery({
    queryKey: ['public', 'announcements'],
    queryFn: async () => {
      return api.get<ApiResponse<AnnouncementItem[]>>('/system/announcements')
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}
```

**Step 2: Commit**

```bash
git add frontend/src/hooks/api/use-config-queries.ts
git commit -m "feat: add usePublicAnnouncements hook"
```

---

### Task 8: Frontend — Rewrite AnnouncementBanner

**Files:**
- Modify: `frontend/src/pages/components/AnnouncementBanner.tsx`

Rewrite to support multiple announcements with:
- Stacked banners, pinned first
- Each shows accent left-border by type
- Pin icon for pinned items
- Individual dismiss (store dismissed IDs in localStorage as JSON array)
- Collapse/expand when 3+ announcements

**Key implementation details:**
- `localStorage` key: `announcements_dismissed` → JSON array of announcement IDs
- Show max 2 when collapsed + "Show all (N)" toggle
- Use `AnimatePresence` for enter/exit animations
- Pin icon: `📌` from lucide (`Pin`)
- Colors per type: `info` → blue/sky, `warning` → amber, `urgent` → red

**Step 1: Write the component**

See full code in the implementation step. Key structure:
```tsx
export function AnnouncementBanner() {
  const { data } = usePublicAnnouncements()
  const [dismissedIds, setDismissedIds] = useState<number[]>(load from localStorage)
  const [expanded, setExpanded] = useState(false)

  const visible = data?.data
    ?.filter(a => !dismissedIds.includes(a.id))
    .sort(pinned first) ?? []

  const displayed = expanded ? visible : visible.slice(0, 2)
  const hasMore = visible.length > 2

  // ... render stacked banners + "Show all" toggle
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/components/AnnouncementBanner.tsx
git commit -m "feat: rewrite AnnouncementBanner for multi-announcement support"
```

---

### Task 9: Frontend — Enhance HeroSection

**Files:**
- Modify: `frontend/src/pages/components/HeroSection.tsx`

Changes:
- Add decorative background: gradient mesh + faint dot grid pattern (CSS background)
- Larger heading: `text-3xl sm:text-4xl md:text-5xl`
- Brand gradient text effect on heading (`bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-transparent`)
- CTA buttons: primary button "浏览仓库" + outline button "查看文档"
- Add stats row: "已缓存 N 个模型 · N 个数据集" (can use static placeholder or fetch from dashboard API)
- Add subtle floating glow orbs (CSS `absolute` positioned colored blobs with blur)

**Step 1: Write enhanced HeroSection**

See full code in implementation step.
Add decorative CSS classes for dot pattern background.

**Step 2: Commit**

```bash
git add frontend/src/pages/components/HeroSection.tsx
git commit -m "feat: enhance HeroSection with visual design elements"
```

---

### Task 10: Frontend — Polish Global Elements

**Files:**
- Modify: `frontend/src/pages/components/Footer.tsx`

Changes:
- Add brand logo/name on left side
- Better visual separation between sections
- Unified spacing

**Step 1: Update Footer**

Add Logo component import and render.

**Step 2: Commit**

```bash
git add frontend/src/pages/components/Footer.tsx
git commit -m "style: polish Footer with brand logo and better spacing"
```

---

### Task 11: Frontend — Update LandingLayout

**Files:**
- Modify: `frontend/src/layouts/LandingLayout.tsx`

Remove old single AnnouncementBanner reference (the import and usage remain, but the component is rewritten).

**Step 1: Verify layout passes**

Check `LandingLayout.tsx` still imports and renders `AnnouncementBanner` correctly (it does, no changes needed if the component keeps the same export name).

---

### Task 12: Build & Verify

**Step 1: Run TypeScript check**
```bash
cd frontend && pnpm tsc --noEmit
```

**Step 2: Run backend tests**
```bash
uv run pytest packages/mgmt_server/tests -v
```

**Step 3: Start dev server and verify**
```bash
uv run --env-file .env.local python -m mgmt_server.main --reload
# Test: curl http://localhost:9800/api/v1/system/announcements
# Should return [{"code": 0, "data": [], "message": "..."}]
cd frontend && pnpm dev
# Check landing page visually
```
