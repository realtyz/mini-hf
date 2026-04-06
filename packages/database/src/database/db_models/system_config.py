"""System configuration model for dynamic settings."""

from datetime import datetime
from sqlalchemy import String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from database.db_models.base import Base


class SystemConfig(Base):
    """System configuration model for dynamic settings."""

    __tablename__ = "system_configs"
    __table_args__ = {"schema": "mini_hf"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="general")
    description: Mapped[str] = mapped_column(Text, nullable=True)
    is_sensitive: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now())
