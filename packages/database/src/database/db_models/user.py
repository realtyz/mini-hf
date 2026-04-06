"""User model."""

from datetime import datetime

from sqlalchemy import Index, String
from sqlalchemy.orm import Mapped, mapped_column

from database.db_models.base import Base


class User(Base):
    """User model for authentication."""

    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_active_by_time", "is_deleted", "created_at"),
        Index("ix_users_email_active", "is_deleted", "email"),
        Index("ix_users_name", "name"),
        {"schema": "mini_hf"},
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now())
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(),
        onupdate=lambda: datetime.now(),
    )
    is_deleted: Mapped[bool] = mapped_column(default=False)
    
    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email})>"
