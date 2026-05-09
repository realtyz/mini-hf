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
