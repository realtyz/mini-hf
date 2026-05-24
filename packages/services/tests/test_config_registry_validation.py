import json

import pytest

from services.config.registry import ConfigKey, ConfigRegistry


def test_normalize_bool_values():
    assert ConfigRegistry.normalize_value(ConfigKey.SMTP_USE_TLS, True) == "true"
    assert ConfigRegistry.normalize_value(ConfigKey.SMTP_USE_TLS, "false") == "false"


def test_normalize_int_value():
    assert ConfigRegistry.normalize_value(ConfigKey.SMTP_PORT, "587") == "587"


def test_invalid_int_value_raises_value_error():
    with pytest.raises(ValueError, match="must be an integer"):
        ConfigRegistry.normalize_value(ConfigKey.SMTP_PORT, "abc")


def test_int_min_max_are_enforced():
    with pytest.raises(ValueError, match="must be <= 65535"):
        ConfigRegistry.normalize_value(ConfigKey.SMTP_PORT, "70000")


def test_normalize_json_value():
    value = ConfigRegistry.normalize_value(ConfigKey.HF_ENDPOINTS, ["https://huggingface.co"])

    assert json.loads(value) == ["https://huggingface.co"]


def test_invalid_json_value_raises_value_error():
    with pytest.raises(ValueError, match="must be valid JSON"):
        ConfigRegistry.normalize_value(ConfigKey.HF_ENDPOINTS, "not-json")
