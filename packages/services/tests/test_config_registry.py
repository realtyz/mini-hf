import json

from services.config.registry import ConfigCategory, ConfigKey, ConfigRegistry, ConfigValueType


def test_registry_contains_expected_builtin_keys():
    key_values = {entry.key.value for entry in ConfigRegistry.all()}

    assert ConfigKey.SMTP_HOST.value in key_values
    assert ConfigKey.SMTP_PASSWORD.value in key_values
    assert ConfigKey.HF_ENDPOINTS.value in key_values
    assert ConfigKey.AUTO_APPROVE_THRESHOLD_GB.value in key_values
    # Announcement keys are NOT registered — use Announcement model instead
    assert "system_announcement" not in key_values
    assert "system_announcement_type" not in key_values
    assert "system_announcement_active" not in key_values


def test_defaults_dict_serializes_json_and_sensitive_metadata():
    defaults = {item["key"]: item for item in ConfigRegistry.defaults_dict()}

    assert defaults[ConfigKey.SMTP_PORT.value]["value"] == "587"
    assert defaults[ConfigKey.SMTP_PASSWORD.value]["is_sensitive"] is True
    assert json.loads(defaults[ConfigKey.HF_ENDPOINTS.value]["value"]) == [
        "https://huggingface.co",
        "https://hf-mirror.com",
    ]


def test_by_category_returns_ordered_entries():
    email_entries = ConfigRegistry.by_category(ConfigCategory.EMAIL)

    assert [entry.key for entry in email_entries] == [
        ConfigKey.SMTP_HOST,
        ConfigKey.SMTP_PORT,
        ConfigKey.SMTP_USERNAME,
        ConfigKey.SMTP_PASSWORD,
        ConfigKey.SMTP_USE_TLS,
        ConfigKey.SMTP_FROM_EMAIL,
    ]


def test_registry_exposes_value_types():
    assert ConfigRegistry.get(ConfigKey.SMTP_PORT).type is ConfigValueType.INT
    assert ConfigRegistry.get(ConfigKey.SMTP_USE_TLS).type is ConfigValueType.BOOL
    assert ConfigRegistry.get(ConfigKey.HF_ENDPOINTS).type is ConfigValueType.JSON
