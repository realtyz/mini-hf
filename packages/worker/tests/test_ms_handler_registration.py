"""Test MS handler + profile recovery registration (Phase 3.5)."""

from unittest.mock import MagicMock

from worker.handlers import register_handlers


def test_register_handlers_registers_modelscope():
    """register_handlers registers the ModelScope download handler + recovery."""
    worker = MagicMock()
    worker.register = MagicMock()
    worker.register_profile_recovery = MagicMock()

    register_handlers(worker)

    # Verify MS download handler registered under download_modelscope
    registered_names = [call.args[0] for call in worker.register.call_args_list]
    assert "download_modelscope" in registered_names
    assert "download_huggingface" in registered_names  # HF still registered

    # Verify MS profile recovery registered with source="modelscope"
    recovery_calls = worker.register_profile_recovery.call_args_list
    ms_recovery = next(
        c for c in recovery_calls if c.kwargs.get("source") == "modelscope"
    )
    assert ms_recovery.kwargs["recovery_func"] is not None
    assert ms_recovery.kwargs["startup_recovery"] is not None

    # Verify HF recovery still present (not clobbered by MS addition)
    hf_recovery = next(
        c for c in recovery_calls if c.kwargs.get("source") == "huggingface"
    )
    assert hf_recovery.kwargs["recovery_func"] is not None


def test_register_handlers_both_sources_distinct():
    """HF and MS recovery funcs are distinct callables (not aliased)."""
    worker = MagicMock()
    register_handlers(worker)

    recovery_calls = worker.register_profile_recovery.call_args_list
    by_source = {c.kwargs["source"]: c for c in recovery_calls}

    assert set(by_source.keys()) == {"huggingface", "modelscope"}
    assert (
        by_source["huggingface"].kwargs["recovery_func"]
        is not by_source["modelscope"].kwargs["recovery_func"]
    )
