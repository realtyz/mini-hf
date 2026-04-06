"""init database

Revision ID: 00001
Revises:
Create Date: 2025-04-06 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "00001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create initial database tables."""
    # Create schema
    op.execute("CREATE SCHEMA IF NOT EXISTS mini_hf")

    # users table
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        schema="mini_hf",
    )
    op.create_index("ix_users_active_by_time", "users", ["is_deleted", "created_at"], schema="mini_hf")
    op.create_index("ix_users_email_active", "users", ["is_deleted", "email"], schema="mini_hf")
    op.create_index("ix_users_name", "users", ["name"], schema="mini_hf")

    # system_configs table
    op.create_table(
        "system_configs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_sensitive", sa.Boolean(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
        schema="mini_hf",
    )

    # tasks table
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("repo_type", sa.String(length=16), nullable=False),
        sa.Column("revision", sa.String(length=64), nullable=False),
        sa.Column("repo_id", sa.String(length=255), nullable=False),
        sa.Column("hf_endpoint", sa.String(length=64), nullable=True),
        sa.Column("repo_items", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("commit_hash", sa.String(length=64), nullable=True),
        sa.Column("access_token", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("pinned_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("total_file_count", sa.Integer(), nullable=False),
        sa.Column("required_file_count", sa.Integer(), nullable=False),
        sa.Column("total_storage", sa.BigInteger(), nullable=False),
        sa.Column("required_storage", sa.BigInteger(), nullable=False),
        sa.Column("downloaded_file_count", sa.Integer(), nullable=False),
        sa.Column("downloaded_bytes", sa.BigInteger(), nullable=False),
        sa.Column("creator_user_id", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="mini_hf",
    )
    op.create_index("ix_task_worker_fetch", "tasks", ["status", "reviewed_at", "pinned_at"], schema="mini_hf")
    op.create_index("ix_task_repo_active", "tasks", ["repo_id", "source", "status"], schema="mini_hf")
    op.create_index("ix_task_source", "tasks", ["source"], schema="mini_hf")
    op.create_index("ix_task_repo_id", "tasks", ["repo_id"], schema="mini_hf")
    op.create_index("ix_task_status", "tasks", ["status"], schema="mini_hf")
    op.create_index("ix_task_created_at", "tasks", ["created_at"], schema="mini_hf")
    op.create_index("ix_task_creator_user_id", "tasks", ["creator_user_id"], schema="mini_hf")
    op.create_index("ix_task_list_user", "tasks", ["creator_user_id", "status", "created_at"], schema="mini_hf")
    op.create_index("ix_task_list_status_created", "tasks", ["status", "created_at"], schema="mini_hf")

    # hf_repo_profiles table
    op.create_table(
        "hf_repo_profiles",
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
        sa.UniqueConstraint("repo_id", "repo_type", name="uq_repo_profiles_repo_id_repo_type"),
        schema="mini_hf",
    )
    op.create_index("idx_repo_profiles_repo_id_repo_type", "hf_repo_profiles", ["repo_id", "repo_type"], unique=True, schema="mini_hf")
    op.create_index("idx_repo_profiles_repo_id", "hf_repo_profiles", ["repo_id"], schema="mini_hf")
    op.create_index("idx_repo_profiles_status_updated_at", "hf_repo_profiles", ["status", "cache_updated_at"], schema="mini_hf")
    op.create_index("ix_hf_repo_profiles_status", "hf_repo_profiles", ["status"], schema="mini_hf")

    # hf_repo_snapshots table
    op.create_table(
        "hf_repo_snapshots",
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
    op.create_index("idx_snapshot_repo_type_rev_status", "hf_repo_snapshots", ["repo_id", "repo_type", "revision", "status"], schema="mini_hf")
    op.create_index("idx_snapshot_repo_type_rev_commit", "hf_repo_snapshots", ["repo_id", "repo_type", "revision", "commit_hash"], schema="mini_hf")
    op.create_index("idx_snapshot_repo_commit", "hf_repo_snapshots", ["repo_id", "commit_hash"], schema="mini_hf")
    op.create_index("idx_snapshot_repo_id", "hf_repo_snapshots", ["repo_id"], schema="mini_hf")

    # hf_repo_tree_items table
    op.create_table(
        "hf_repo_tree_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("oid", sa.String(length=64), nullable=False),
        sa.Column("commit_hash", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("path", sa.String(length=2048), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("lfs_oid", sa.String(length=64), nullable=True),
        sa.Column("lfs_size", sa.BigInteger(), nullable=True),
        sa.Column("lfs_pointer_size", sa.BigInteger(), nullable=True),
        sa.Column("xet_hash", sa.String(length=64), nullable=True),
        sa.Column("is_cached", sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("commit_hash", "path", name="uq_hf_repo_tree_items_commit_path"),
        schema="mini_hf",
    )
    op.create_index("idx_hf_repo_tree_items_commit_hash", "hf_repo_tree_items", ["commit_hash"], schema="mini_hf")
    op.create_index("idx_hf_repo_tree_items_cached", "hf_repo_tree_items", ["commit_hash", "type", "is_cached"], schema="mini_hf")
    op.create_index("idx_hf_repo_tree_items_commit_path", "hf_repo_tree_items", ["commit_hash", "path"], schema="mini_hf")


def downgrade() -> None:
    """Drop all database tables."""
    # Drop tables in reverse order
    op.drop_table("hf_repo_tree_items", schema="mini_hf")
    op.drop_table("hf_repo_snapshots", schema="mini_hf")
    op.drop_table("hf_repo_profiles", schema="mini_hf")
    op.drop_table("tasks", schema="mini_hf")
    op.drop_table("system_configs", schema="mini_hf")
    op.drop_table("users", schema="mini_hf")

    # Drop schema
    op.execute("DROP SCHEMA IF EXISTS mini_hf CASCADE")
