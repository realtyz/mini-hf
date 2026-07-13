"""Test fixtures for ms_server.

Mirrors the DB-session fixture pattern in ``packages/services/tests/conftest.py``.
Integration tests hit a real PostgreSQL instance (configured via PG_* env /
settings). Cross-session visibility matters: the app's ``unit_of_work`` opens
its own session, so the seeded data must be committed explicitly.
"""

import uuid

import pytest
import pytest_asyncio
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from core.settings import settings
from database.db_models import (
    MsRepoProfile,
    MsRepoSnapshot,
    MsRepoTreeItem,
    RepoStatus,
    SnapshotStatus,
    TreeItemType,
)


def _db_url() -> str:
    return (
        f"postgresql+asyncpg://{settings.PG_USERNAME}:{settings.PG_PASSWORD}"
        f"@{settings.PG_HOST}:{settings.PG_PORT}/{settings.PG_DATABASE}"
    )


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(_db_url(), echo=False)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    session = factory()
    try:
        yield session
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
        await engine.dispose()


def _unique_repo_id() -> str:
    return f"test-ms/{uuid.uuid4().hex[:12]}"


@pytest_asyncio.fixture
async def seeded_model_repo(db_session: AsyncSession):
    """Seed a model repo with one snapshot and two file tree items.

    Commits explicitly so the app's separate session can see the rows.
    Yields (repo_id, commit_hash) and cleans up afterwards.
    """
    repo_id = _unique_repo_id()
    commit_hash = uuid.uuid4().hex
    revision = "master"

    profile = MsRepoProfile(
        repo_id=repo_id,
        repo_type="model",
        status=RepoStatus.ACTIVE,
    )
    db_session.add(profile)
    await db_session.flush()

    snapshot = MsRepoSnapshot(
        repo_id=repo_id,
        repo_type="model",
        revision=revision,
        commit_hash=commit_hash,
        status=SnapshotStatus.ACTIVE,
    )
    db_session.add(snapshot)
    await db_session.flush()

    items = [
        MsRepoTreeItem(
            commit_hash=commit_hash,
            type=TreeItemType.FILE,
            path="config.json",
            size=730,
            oid="config-" + uuid.uuid4().hex,
            lfs_oid=None,
            is_cached=False,
        ),
        MsRepoTreeItem(
            commit_hash=commit_hash,
            type=TreeItemType.FILE,
            path="tokenizer/vocab.json",
            size=1024,
            oid=None,
            lfs_oid="lfs-" + uuid.uuid4().hex,
            is_cached=False,
        ),
        MsRepoTreeItem(
            commit_hash=commit_hash,
            type=TreeItemType.DIRECTORY,
            path="tokenizer",
            size=0,
            oid="tree-token",
            lfs_oid=None,
            is_cached=None,
        ),
    ]
    db_session.add_all(items)
    await db_session.commit()

    yield repo_id, commit_hash

    # Teardown
    await db_session.execute(
        delete(MsRepoTreeItem).where(MsRepoTreeItem.commit_hash == commit_hash)
    )
    await db_session.execute(
        delete(MsRepoSnapshot).where(MsRepoSnapshot.commit_hash == commit_hash)
    )
    await db_session.execute(
        delete(MsRepoProfile).where(
            MsRepoProfile.repo_id == repo_id,
            MsRepoProfile.repo_type == "model",
        )
    )
    await db_session.commit()


@pytest_asyncio.fixture
async def seeded_dataset_repo(db_session: AsyncSession):
    """Seed a dataset repo with a snapshot and 3 file items for pagination."""
    repo_id = _unique_repo_id()
    commit_hash = uuid.uuid4().hex
    revision = "master"

    profile = MsRepoProfile(
        repo_id=repo_id,
        repo_type="dataset",
        status=RepoStatus.ACTIVE,
    )
    db_session.add(profile)
    await db_session.flush()

    snapshot = MsRepoSnapshot(
        repo_id=repo_id,
        repo_type="dataset",
        revision=revision,
        commit_hash=commit_hash,
        status=SnapshotStatus.ACTIVE,
    )
    db_session.add(snapshot)
    await db_session.flush()

    items = []
    for i in range(3):
        items.append(
            MsRepoTreeItem(
                commit_hash=commit_hash,
                type=TreeItemType.FILE,
                path=f"data/file-{i}.parquet",
                size=1000 * (i + 1),
                oid=f"oid-{i}-" + uuid.uuid4().hex,
                lfs_oid=None,
                is_cached=False,
            )
        )
    db_session.add_all(items)
    await db_session.commit()

    yield repo_id, commit_hash

    await db_session.execute(
        delete(MsRepoTreeItem).where(MsRepoTreeItem.commit_hash == commit_hash)
    )
    await db_session.execute(
        delete(MsRepoSnapshot).where(MsRepoSnapshot.commit_hash == commit_hash)
    )
    await db_session.execute(
        delete(MsRepoProfile).where(
            MsRepoProfile.repo_id == repo_id,
            MsRepoProfile.repo_type == "dataset",
        )
    )
    await db_session.commit()
