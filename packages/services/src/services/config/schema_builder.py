"""ConfigSchemaBuilder — builds the UI schema from registry metadata + DB values."""

from __future__ import annotations

import json
from dataclasses import asdict

from loguru import logger

from services.config._provider import ConfigProvider
from services.config.registry import ConfigRegistry, ConfigValueType

from mgmt_server.api.v1.schemas.configs import (
    ConfigCategorySchema,
    ConfigFieldSchema,
    ConfigSchemaData,
    ConfigUISchema,
)


class ConfigSchemaBuilder:
    """Builds a ConfigSchemaData by combining registry metadata with DB values.

    Traverses ConfigRegistry categories and entries, reads current values
    from the ConfigProvider, parses them according to their declared type,
    and assembles the UI-facing schema response.
    """

    def __init__(self, provider: ConfigProvider):
        self._provider = provider

    async def build(self) -> ConfigSchemaData:
        categories: list[ConfigCategorySchema] = []
        for category_meta in ConfigRegistry.categories():
            fields: list[ConfigFieldSchema] = []
            for entry in ConfigRegistry.by_category(category_meta.id):
                raw_value = await self._provider.get(entry.key.value, "")
                has_value = bool(raw_value)

                if entry.sensitive:
                    field_value: object = ""
                elif not raw_value:
                    field_value = entry.default
                elif entry.type is ConfigValueType.JSON:
                    try:
                        field_value = json.loads(raw_value)
                    except (json.JSONDecodeError, TypeError):
                        logger.warning(
                            "Failed to parse JSON config '{}', falling back to default",
                            entry.key.value,
                        )
                        field_value = entry.default
                elif entry.type is ConfigValueType.BOOL:
                    lowered = raw_value.lower()
                    field_value = lowered in ("true", "1")
                elif entry.type is ConfigValueType.INT:
                    try:
                        field_value = int(raw_value)
                    except (ValueError, TypeError):
                        logger.warning(
                            "Failed to parse int config '{}' (raw={!r}), falling back to default",
                            entry.key.value,
                            raw_value,
                        )
                        field_value = entry.default
                elif entry.type is ConfigValueType.FLOAT:
                    try:
                        field_value = float(raw_value)
                    except (ValueError, TypeError):
                        logger.warning(
                            "Failed to parse float config '{}' (raw={!r}), falling back to default",
                            entry.key.value,
                            raw_value,
                        )
                        field_value = entry.default
                else:
                    field_value = raw_value

                fields.append(
                    ConfigFieldSchema(
                        key=entry.key.value,
                        label=entry.label,
                        type=entry.type.value,
                        default=entry.default,
                        value=field_value,
                        sensitive=entry.sensitive,
                        has_value=has_value,
                        required=entry.required,
                        min_value=entry.min_value,
                        max_value=entry.max_value,
                        description=entry.description,
                        ui=ConfigUISchema(**asdict(entry.ui)),
                    )
                )
            categories.append(
                ConfigCategorySchema(
                    id=category_meta.id.value,
                    label=category_meta.label,
                    description=category_meta.description,
                    visual=category_meta.visual,
                    fields=fields,
                    custom_actions=category_meta.custom_actions,
                )
            )
        return ConfigSchemaData(categories=categories)
