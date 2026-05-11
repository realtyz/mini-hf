"""remove INACTIVE status from repos and snapshots

Revision ID: 00004
Revises: 00003
Create Date: 2026-05-10 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "00004"
down_revision: Union[str, Sequence[str], None] = "00003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE mini_hf.hf_repo_profiles SET status = 'active' WHERE status = 'inactive'"
    )
    op.execute(
        "UPDATE mini_hf.hf_repo_snapshots SET status = 'active' WHERE status = 'inactive'"
    )


def downgrade() -> None:
    # Cannot restore which rows were originally INACTIVE — no-op
    pass
