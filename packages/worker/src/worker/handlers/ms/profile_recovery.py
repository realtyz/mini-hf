"""ModelScope profile recovery functions.

Provides the per-session and startup recovery functions that the Worker
delegates to for ModelScope source tasks.
"""

from loguru import logger

from database import new_session, RepoStatus
from database.db_repositories import MsRepoProfileRepository, MsRepoSnapshotRepository
from services.task import TaskService


async def restore_ms_profile_in_session(session, repo_id: str, repo_type: str) -> None:
    """Restore MS profile status within an existing session.

    Checks for an active snapshot: sets profile to ACTIVE if one
    exists, otherwise INACTIVE.
    """
    snapshot_repo = MsRepoSnapshotRepository(session)
    snapshots, _ = await snapshot_repo.get_repo_with_snapshots(repo_id, repo_type)
    target = RepoStatus.ACTIVE if snapshots else RepoStatus.INACTIVE

    profile_repo = MsRepoProfileRepository(session)
    await profile_repo.set_profile_status(
        repo_id=repo_id,
        repo_type=repo_type,
        status=target,
    )


async def recover_ms_updating_profiles() -> None:
    """Recover MS profiles stuck in UPDATING after a worker crash.

    Scans all UPDATING profiles and restores them to ACTIVE (if an
    active snapshot exists) or INACTIVE, provided no RUNNING task is
    currently processing the repo.
    """
    async with new_session() as session:
        profile_repo = MsRepoProfileRepository(session)
        profiles = await profile_repo.get_updating_profiles()

    if not profiles:
        return

    logger.info(
        "Found {} MS profile(s) stuck in UPDATING, checking for recovery...",
        len(profiles),
    )

    recovered = 0
    for profile in profiles:
        async with new_session() as session:
            task_service = TaskService(session)
            has_running = await task_service.has_running_task(
                profile.repo_id, profile.repo_type
            )

        if has_running:
            logger.info(
                "  -> Skipping {}: RUNNING task exists, worker will handle it",
                profile.repo_id,
            )
            continue

        async with new_session() as session:
            snapshot_repo = MsRepoSnapshotRepository(session)
            snapshots, _ = await snapshot_repo.get_repo_with_snapshots(
                profile.repo_id, profile.repo_type
            )
            target = RepoStatus.ACTIVE if snapshots else RepoStatus.INACTIVE

            profile_repo = MsRepoProfileRepository(session)
            await profile_repo.set_profile_status(
                repo_id=profile.repo_id,
                repo_type=profile.repo_type,
                status=target,
            )
            await session.commit()

        logger.info(
            "  -> Recovered {} from UPDATING to {}",
            profile.repo_id,
            target.value,
        )
        recovered += 1

    if recovered > 0:
        logger.info("Recovered {} MS profile(s)", recovered)
