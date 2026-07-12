"""Test MS handler build_url_builder revision override + service close (Phase 3.2).

Covers the two key design points:
- D1: build_url_builder closure must use ctx.revision (original branch/tag),
  ignoring the revision param (which is ctx.commit_hash / pseudo_commit).
- D2/R2: _close_ms_service is idempotent and is invoked in restore_profile's
  finally block (abort path).

These tests bypass __init__ (which requires a real Task + TaskControl and
hits the DB) by using MsDownloadHandler.__new__ and setting only the
attributes the builder/close methods need.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from worker.handlers.ms.handler import MsDownloadHandler


def _make_handler():
    """Construct a MsDownloadHandler without running __init__ (no DB needed)."""
    handler = MsDownloadHandler.__new__(MsDownloadHandler)
    handler.ctx = MagicMock()
    handler._ms_service = None
    return handler


class TestBuildUrlBuilderIgnoresPassedRevision:
    """D1: build_url_builder closure must use ctx.revision, not the passed revision."""

    def test_uses_ctx_revision_not_pseudo_commit(self):
        """Pseudo_commit (64-char sha256) passed as revision must be ignored."""
        handler = _make_handler()
        handler.ctx.revision = "master"  # original branch/tag
        ms_service = MagicMock()
        ms_service.build_file_url = MagicMock(return_value="https://example.com/file")
        handler._ms_service = ms_service

        builder = handler.build_url_builder()
        # Pass a 64-char pseudo_commit as the revision param (what file_processor
        # passes -- it is ctx.commit_hash). Must be ignored.
        builder(
            repo_id="org/repo",
            repo_type="model",
            revision="a" * 64,
            file_path="config.json",
        )

        ms_service.build_file_url.assert_called_once_with(
            "org/repo", "model", "master", "config.json"
        )

    def test_uses_ctx_revision_for_real_sha_too(self):
        """Even a 40-char real SHA is ignored -- unconditional ctx.revision policy."""
        handler = _make_handler()
        handler.ctx.revision = "dev"
        ms_service = MagicMock()
        ms_service.build_file_url = MagicMock(return_value="url")
        handler._ms_service = ms_service

        builder = handler.build_url_builder()
        builder("org/repo", "model", "b" * 40, "file.bin")

        ms_service.build_file_url.assert_called_once_with(
            "org/repo", "model", "dev", "file.bin"
        )

    def test_builder_uses_revision_captured_at_build_time(self):
        """Closure captures ctx.revision at build_url_builder() call time."""
        handler = _make_handler()
        handler.ctx.revision = "v1.0"
        ms_service = MagicMock()
        ms_service.build_file_url = MagicMock(return_value="url")
        handler._ms_service = ms_service

        builder = handler.build_url_builder()
        # Mutate ctx.revision after builder construction -- must NOT affect it
        handler.ctx.revision = "v2.0"
        builder("org/repo", "model", "deadbeef", "f.txt")

        ms_service.build_file_url.assert_called_once_with(
            "org/repo", "model", "v1.0", "f.txt"
        )


class TestBuildAuthHeaderBuilder:
    """build_auth_header_builder converts empty dict -> None (aligns HF semantics)."""

    def test_empty_dict_becomes_none(self):
        handler = _make_handler()
        ms_service = MagicMock()
        ms_service.build_auth_headers = MagicMock(return_value={})
        handler._ms_service = ms_service

        builder = handler.build_auth_header_builder()
        assert builder("any-token") is None  # empty -> None

    def test_non_empty_dict_preserved(self):
        handler = _make_handler()
        headers = {"Cookie": "m_session_id=t", "Authorization": "Bearer t"}
        ms_service = MagicMock()
        ms_service.build_auth_headers = MagicMock(return_value=headers)
        handler._ms_service = ms_service

        builder = handler.build_auth_header_builder()
        assert builder("t") == headers


class TestHeadCheckDisabled:
    """ModelScope's /repo file endpoint returns 404 for HEAD requests, so the
    downloader's HEAD pre-check must be skipped. The handler overrides
    head_check_enabled to False (base default is None -> defer to settings)."""

    def test_ms_handler_disables_head_check(self):
        handler = _make_handler()
        assert handler.head_check_enabled is False

    def test_base_default_is_none(self):
        """The base default is None (defer to settings), so HuggingFace
        (which doesn't override) keeps the HEAD pre-check."""
        from worker.handlers.hf.handler import HfDownloadHandler

        hf_handler = HfDownloadHandler.__new__(HfDownloadHandler)
        assert hf_handler.head_check_enabled is None


class TestCloseMsService:
    """R2: _close_ms_service is idempotent and releases the httpx client."""

    @pytest.mark.asyncio
    async def test_close_idempotent_when_none(self):
        """No service -> no-op, no exception."""
        handler = _make_handler()
        handler._ms_service = None
        await handler._close_ms_service()  # must not raise
        assert handler._ms_service is None

    @pytest.mark.asyncio
    async def test_close_calls_service_close(self):
        handler = _make_handler()
        svc = AsyncMock()
        handler._ms_service = svc

        await handler._close_ms_service()

        svc.close.assert_awaited_once()
        assert handler._ms_service is None

    @pytest.mark.asyncio
    async def test_close_swallows_service_close_exception(self):
        """If service.close() raises, _close_ms_service still nulls the ref."""
        handler = _make_handler()
        svc = AsyncMock()
        svc.close = AsyncMock(side_effect=RuntimeError("boom"))
        handler._ms_service = svc

        await handler._close_ms_service()  # must not raise

        svc.close.assert_awaited_once()
        assert handler._ms_service is None  # ref cleared despite exception

    @pytest.mark.asyncio
    async def test_double_close_safe(self):
        handler = _make_handler()
        svc = AsyncMock()
        handler._ms_service = svc

        await handler._close_ms_service()
        await handler._close_ms_service()  # second call: svc already None

        svc.close.assert_awaited_once()  # only the first call hit svc


class TestRestoreProfileClosesService:
    """R2: restore_profile's finally block must close the service.

    restore_profile wraps its DB logic in try/except (swallowing errors), so
    the finally clause is the reliable close point for the abort path. We
    patch the inner DB-touching methods so we can assert close was called
    without a live DB.
    """

    @pytest.mark.asyncio
    async def test_close_called_on_restore_profile_success(self):
        handler = _make_handler()
        handler.ctx.repo_id = "org/repo"
        handler.ctx.repo_type = "model"
        handler.ctx.revision = "master"
        handler.ctx.new_commit_hash = "abc123"
        svc = AsyncMock()
        handler._ms_service = svc

        # Patch new_session so restore_profile's DB block runs without a DB
        # -- we make the snapshot lookup return None (cancel/pause branch).
        class _FakeSession:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            async def commit(self):
                pass

        fake_session = _FakeSession()

        class _FakeSnapshotRepo:
            async def get_active_snapshot(self, *a, **k):
                return None

        class _FakeProfileRepo:
            async def set_profile_status(self, **k):
                pass

        import worker.handlers.ms.handler as mod

        with (
            patch.object(mod, "new_session", return_value=fake_session),
            patch.object(
                mod, "MsRepoSnapshotRepository", return_value=_FakeSnapshotRepo()
            ),
            patch.object(
                mod, "MsRepoProfileRepository", return_value=_FakeProfileRepo()
            ),
        ):
            await handler.restore_profile()

        svc.close.assert_awaited_once()
        assert handler._ms_service is None

    @pytest.mark.asyncio
    async def test_close_called_even_if_restore_raises(self):
        """If the DB layer raises, finally still closes the service."""
        handler = _make_handler()
        handler.ctx.repo_id = "org/repo"
        handler.ctx.repo_type = "model"
        handler.ctx.revision = "master"
        handler.ctx.new_commit_hash = "abc123"
        svc = AsyncMock()
        handler._ms_service = svc

        import worker.handlers.ms.handler as mod

        # Force new_session to raise inside the try block
        with patch.object(mod, "new_session", side_effect=RuntimeError("db down")):
            await handler.restore_profile()  # swallows, then finally closes

        svc.close.assert_awaited_once()
        assert handler._ms_service is None
