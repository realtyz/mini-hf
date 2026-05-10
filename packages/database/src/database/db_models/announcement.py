"""Announcement model for system-wide notifications."""

from datetime import datetime
from sqlalchemy import String, Text, Boolean, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from database.db_models.base import Base
from database.db_models.enums import AnnouncementType


class Announcement(Base):
    __tablename__ = "announcements"
    __table_args__ = {"schema": "mini_hf"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    announcement_type: Mapped[AnnouncementType] = mapped_column(
        Enum(AnnouncementType, native_enum=False),
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
