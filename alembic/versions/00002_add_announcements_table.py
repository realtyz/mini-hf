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
    op.create_table(
        "announcements",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "announcement_type",
            sa.String(length=255),
            nullable=False,
            server_default="info",
        ),
        sa.Column(
            "is_pinned", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="mini_hf",
    )


def downgrade() -> None:
    op.drop_table("announcements", schema="mini_hf")
