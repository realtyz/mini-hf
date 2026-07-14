"""create ms_repo tables

Revision ID: 00005
Revises: 00004
Create Date: 2026-07-12 10:00:00.000000

Creates ModelScope-specific repository tables (ms_repo_profiles,
ms_repo_snapshots, ms_repo_tree_items) mirroring the hf_repo_* schema but
WITHOUT the xet_hash column (HF-specific). Index/constraint names carry the
ms_ prefix to stay distinct from the HF counterparts.

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "00005"
down_revision: Union[str, Sequence[str], None] = "00004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create ModelScope repository tables."""
    # ms_repo_profiles table
    op.create_table(
        "ms_repo_profiles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("repo_id", sa.String(length=255), nullable=False),
        sa.Column("repo_type", sa.String(length=16), nullable=False),
        sa.Column("pipeline_tag", sa.String(length=255), nullable=True),
        sa.Column("cached_commits", sa.Integer(), nullable=False),
        sa.Column("downloads", sa.Integer(), nullable=False),
        sa.Column("first_cached_at", sa.DateTime(), nullable=True),
        sa.Column("cache_updated_at", sa.DateTime(), nullable=True),
        sa.Column("last_downloaded_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "repo_id", "repo_type", name="uq_ms_repo_profiles_repo_id_repo_type"
        ),
        schema="mini_hf",
    )
    op.create_index(
        "idx_ms_repo_profiles_repo_id_repo_type",
        "ms_repo_profiles",
        ["repo_id", "repo_type"],
        unique=True,
        schema="mini_hf",
    )
    op.create_index(
        "idx_ms_repo_profiles_repo_id", "ms_repo_profiles", ["repo_id"], schema="mini_hf"
    )
    op.create_index(
        "idx_ms_repo_profiles_status_updated_at",
        "ms_repo_profiles",
        ["status", "cache_updated_at"],
        schema="mini_hf",
    )
    op.create_index(
        "ix_ms_repo_profiles_status", "ms_repo_profiles", ["status"], schema="mini_hf"
    )

    # ms_repo_snapshots table
    op.create_table(
        "ms_repo_snapshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("repo_id", sa.String(length=255), nullable=False),
        sa.Column("repo_type", sa.String(length=16), nullable=False),
        sa.Column("revision", sa.String(length=64), nullable=False),
        sa.Column("commit_hash", sa.String(length=255), nullable=False),
        sa.Column("committed_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="mini_hf",
    )
    op.create_index(
        "idx_ms_snapshot_repo_type_rev_status",
        "ms_repo_snapshots",
        ["repo_id", "repo_type", "revision", "status"],
        schema="mini_hf",
    )
    op.create_index(
        "idx_ms_snapshot_repo_type_rev_commit",
        "ms_repo_snapshots",
        ["repo_id", "repo_type", "revision", "commit_hash"],
        schema="mini_hf",
    )
    op.create_index(
        "idx_ms_snapshot_repo_commit",
        "ms_repo_snapshots",
        ["repo_id", "commit_hash"],
        schema="mini_hf",
    )
    op.create_index(
        "idx_ms_snapshot_repo_id", "ms_repo_snapshots", ["repo_id"], schema="mini_hf"
    )

    # ms_repo_tree_items table
    op.create_table(
        "ms_repo_tree_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("oid", sa.String(length=64), nullable=False),
        sa.Column("commit_hash", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("path", sa.String(length=2048), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("lfs_oid", sa.String(length=64), nullable=True),
        sa.Column("lfs_size", sa.BigInteger(), nullable=True),
        sa.Column("lfs_pointer_size", sa.BigInteger(), nullable=True),
        sa.Column("is_cached", sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "commit_hash", "path", name="uq_ms_repo_tree_items_commit_path"
        ),
        schema="mini_hf",
    )
    op.create_index(
        "idx_ms_repo_tree_items_commit_hash",
        "ms_repo_tree_items",
        ["commit_hash"],
        schema="mini_hf",
    )
    op.create_index(
        "idx_ms_repo_tree_items_cached",
        "ms_repo_tree_items",
        ["commit_hash", "type", "is_cached"],
        schema="mini_hf",
    )
    op.create_index(
        "idx_ms_repo_tree_items_commit_path",
        "ms_repo_tree_items",
        ["commit_hash", "path"],
        schema="mini_hf",
    )


def downgrade() -> None:
    """Drop ModelScope repository tables."""
    # Drop tables in reverse order of creation
    op.drop_table("ms_repo_tree_items", schema="mini_hf")
    op.drop_table("ms_repo_snapshots", schema="mini_hf")
    op.drop_table("ms_repo_profiles", schema="mini_hf")
