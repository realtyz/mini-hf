from services.config import ConfigRegistry
from services.config.service import ConfigService


def test_config_service_defaults_match_registry():
    assert ConfigService.DEFAULT_CONFIGS == ConfigRegistry.defaults_dict()


def test_announcement_defaults_are_not_created_from_registry():
    keys = {item["key"] for item in ConfigService.DEFAULT_CONFIGS}

    assert "system_announcement" not in keys
    assert "system_announcement_type" not in keys
    assert "system_announcement_active" not in keys
