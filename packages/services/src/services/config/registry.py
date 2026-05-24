from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Literal


class ConfigKey(StrEnum):
    SMTP_HOST = "smtp_host"
    SMTP_PORT = "smtp_port"
    SMTP_USERNAME = "smtp_username"
    SMTP_PASSWORD = "smtp_password"
    SMTP_USE_TLS = "smtp_use_tls"
    SMTP_FROM_EMAIL = "smtp_from_email"
    HF_ENDPOINTS = "hf_endpoints"
    HF_DEFAULT_ENDPOINT = "hf_default_endpoint"
    NOTIFICATION_EMAIL = "notification_email"
    NOTIFICATION_TASK_APPROVAL = "notification_task_approval"
    AUTO_APPROVE_ENABLED = "auto_approve_enabled"
    AUTO_APPROVE_THRESHOLD_GB = "auto_approve_threshold_gb"


class ConfigValueType(StrEnum):
    STRING = "string"
    INT = "int"
    FLOAT = "float"
    BOOL = "bool"
    JSON = "json"
    PASSWORD = "password"
    SELECT = "select"


class ConfigCategory(StrEnum):
    EMAIL = "email"
    HUGGINGFACE = "huggingface"
    NOTIFICATION = "notification"


@dataclass(frozen=True)
class UIMetadata:
    widget: Literal[
        "input",
        "number",
        "switch",
        "select",
        "password",
        "textarea",
        "hf_endpoint_list",
    ] = "input"
    placeholder: str = ""
    input_type: str = "text"
    options: list[dict[str, str]] = field(default_factory=list)
    rows: int = 3
    helper_text: str = ""
    col_span: int = 1


@dataclass(frozen=True)
class ConfigEntry:
    key: ConfigKey
    type: ConfigValueType
    default: Any
    category: ConfigCategory
    label: str
    description: str = ""
    sensitive: bool = False
    required: bool = False
    min_value: int | float | None = None
    max_value: int | float | None = None
    ui: UIMetadata | None = None

    def __post_init__(self) -> None:
        if self.ui is None:
            object.__setattr__(self, "ui", infer_ui(self.type))


def infer_ui(value_type: ConfigValueType) -> UIMetadata:
    mapping = {
        ConfigValueType.STRING: UIMetadata(widget="input"),
        ConfigValueType.INT: UIMetadata(widget="number", input_type="number"),
        ConfigValueType.FLOAT: UIMetadata(widget="number", input_type="number"),
        ConfigValueType.BOOL: UIMetadata(widget="switch"),
        ConfigValueType.PASSWORD: UIMetadata(widget="password", input_type="password"),
        ConfigValueType.JSON: UIMetadata(widget="textarea", rows=4),
        ConfigValueType.SELECT: UIMetadata(widget="select"),
    }
    return mapping[value_type]


@dataclass(frozen=True)
class ConfigCategoryMetadata:
    id: ConfigCategory
    label: str
    description: str
    visual: str
    custom_actions: list[str] = field(default_factory=list)


class ConfigRegistry:
    _entries: dict[ConfigKey, ConfigEntry] = {}
    _by_category: dict[ConfigCategory, list[ConfigEntry]] = {}
    _categories: dict[ConfigCategory, ConfigCategoryMetadata] = {
        ConfigCategory.EMAIL: ConfigCategoryMetadata(
            id=ConfigCategory.EMAIL,
            label="邮件配置",
            description="SMTP 邮件服务",
            visual="email",
            custom_actions=["smtp_test"],
        ),
        ConfigCategory.HUGGINGFACE: ConfigCategoryMetadata(
            id=ConfigCategory.HUGGINGFACE,
            label="HF 配置",
            description="Endpoint 节点管理",
            visual="huggingface",
        ),
        ConfigCategory.NOTIFICATION: ConfigCategoryMetadata(
            id=ConfigCategory.NOTIFICATION,
            label="告警推送",
            description="告警与推送设置",
            visual="notification",
        ),
    }

    @classmethod
    def register(cls, entry: ConfigEntry) -> ConfigEntry:
        cls._entries[entry.key] = entry
        cls._by_category.setdefault(entry.category, []).append(entry)
        return entry

    @classmethod
    def get(cls, key: ConfigKey | str) -> ConfigEntry:
        return cls._entries[ConfigKey(key)]

    @classmethod
    def has(cls, key: str) -> bool:
        try:
            return ConfigKey(key) in cls._entries
        except ValueError:
            return False

    @classmethod
    def all(cls) -> list[ConfigEntry]:
        return list(cls._entries.values())

    @classmethod
    def by_category(cls, category: ConfigCategory | str) -> list[ConfigEntry]:
        return cls._by_category.get(ConfigCategory(category), [])

    @classmethod
    def categories(cls) -> list[ConfigCategoryMetadata]:
        return list(cls._categories.values())

    @classmethod
    def category_metadata(cls, category: ConfigCategory | str) -> ConfigCategoryMetadata:
        return cls._categories[ConfigCategory(category)]

    @classmethod
    def defaults_dict(cls) -> list[dict[str, object]]:
        defaults: list[dict[str, object]] = []
        for entry in cls.all():
            if entry.type is ConfigValueType.JSON:
                value = json.dumps(entry.default)
            elif entry.type is ConfigValueType.BOOL:
                value = str(entry.default).lower()
            else:
                value = str(entry.default)
            defaults.append(
                {
                    "key": entry.key.value,
                    "value": value,
                    "category": entry.category.value,
                    "description": entry.description,
                    "is_sensitive": entry.sensitive,
                }
            )
        return defaults

    @classmethod
    def normalize_value(cls, key: ConfigKey | str, value: Any) -> str:
        entry = cls.get(key)
        if entry.type in (ConfigValueType.STRING, ConfigValueType.PASSWORD, ConfigValueType.SELECT):
            normalized = str(value)
        elif entry.type is ConfigValueType.INT:
            try:
                int_value = int(value)
            except (TypeError, ValueError):
                raise ValueError(f"{entry.key.value} must be an integer")
            cls._validate_number(entry, int_value)
            normalized = str(int_value)
        elif entry.type is ConfigValueType.FLOAT:
            try:
                float_value = float(value)
            except (TypeError, ValueError):
                raise ValueError(f"{entry.key.value} must be a number")
            cls._validate_number(entry, float_value)
            normalized = str(float_value)
        elif entry.type is ConfigValueType.BOOL:
            normalized = cls._normalize_bool(entry, value)
        elif entry.type is ConfigValueType.JSON:
            normalized = cls._normalize_json(entry, value)
        else:
            normalized = str(value)

        if entry.required and normalized == "":
            raise ValueError(f"{entry.key.value} is required")
        return normalized

    @staticmethod
    def _validate_number(entry: ConfigEntry, value: int | float) -> None:
        if entry.min_value is not None and value < entry.min_value:
            raise ValueError(f"{entry.key.value} must be >= {entry.min_value}")
        if entry.max_value is not None and value > entry.max_value:
            raise ValueError(f"{entry.key.value} must be <= {entry.max_value}")

    @staticmethod
    def _normalize_bool(entry: ConfigEntry, value: Any) -> str:
        if isinstance(value, bool):
            return str(value).lower()
        lowered = str(value).lower()
        if lowered in {"true", "1", "yes", "on"}:
            return "true"
        if lowered in {"false", "0", "no", "off"}:
            return "false"
        raise ValueError(f"{entry.key.value} must be a boolean")

    @staticmethod
    def _normalize_json(entry: ConfigEntry, value: Any) -> str:
        if isinstance(value, str):
            try:
                json.loads(value)
            except json.JSONDecodeError:
                raise ValueError(f"{entry.key.value} must be valid JSON")
            return value
        try:
            return json.dumps(value)
        except TypeError:
            raise ValueError(f"{entry.key.value} must be valid JSON")


# TODO: old announcement config keys (system_announcement, system_announcement_type,
# system_announcement_active) may still exist as SystemConfig rows from before the
# migration to the Announcement model + /system/announcements API. A future alembic
# migration or data cleanup script should remove them once all callers have migrated.

# ═══════════════════════════════════════════════════════════════════
# Email (SMTP)
# ═══════════════════════════════════════════════════════════════════

ConfigRegistry.register(
    ConfigEntry(
        key=ConfigKey.SMTP_HOST,
        type=ConfigValueType.STRING,
        default="",
        category=ConfigCategory.EMAIL,
        label="SMTP 服务器地址",
        description="SMTP server hostname",
        ui=UIMetadata(widget="input", placeholder="smtp.example.com"),
    )
)
ConfigRegistry.register(
    ConfigEntry(
        key=ConfigKey.SMTP_PORT,
        type=ConfigValueType.INT,
        default=587,
        category=ConfigCategory.EMAIL,
        label="端口",
        description="SMTP server port",
        required=True,
        min_value=1,
        max_value=65535,
    )
)
ConfigRegistry.register(
    ConfigEntry(
        key=ConfigKey.SMTP_USERNAME,
        type=ConfigValueType.STRING,
        default="",
        category=ConfigCategory.EMAIL,
        label="用户名",
        description="SMTP authentication username",
    )
)
ConfigRegistry.register(
    ConfigEntry(
        key=ConfigKey.SMTP_PASSWORD,
        type=ConfigValueType.PASSWORD,
        default="",
        category=ConfigCategory.EMAIL,
        label="密码",
        description="SMTP authentication password",
        sensitive=True,
        ui=UIMetadata(widget="password", input_type="password", placeholder="留空保持不变"),
    )
)
ConfigRegistry.register(
    ConfigEntry(
        key=ConfigKey.SMTP_USE_TLS,
        type=ConfigValueType.BOOL,
        default=True,
        category=ConfigCategory.EMAIL,
        label="使用 TLS 加密",
        description="Use TLS encryption for SMTP",
    )
)
ConfigRegistry.register(
    ConfigEntry(
        key=ConfigKey.SMTP_FROM_EMAIL,
        type=ConfigValueType.STRING,
        default="",
        category=ConfigCategory.EMAIL,
        label="发件人邮箱",
        description="Default sender email address",
        ui=UIMetadata(widget="input", input_type="email", placeholder="noreply@example.com"),
    )
)

# ═══════════════════════════════════════════════════════════════════
# HuggingFace
# ═══════════════════════════════════════════════════════════════════

ConfigRegistry.register(
    ConfigEntry(
        key=ConfigKey.HF_ENDPOINTS,
        type=ConfigValueType.JSON,
        default=["https://huggingface.co", "https://hf-mirror.com"],
        category=ConfigCategory.HUGGINGFACE,
        label="可用 Endpoints",
        description="HuggingFace endpoint list (JSON array)",
        required=True,
        ui=UIMetadata(widget="hf_endpoint_list"),
    )
)
ConfigRegistry.register(
    ConfigEntry(
        key=ConfigKey.HF_DEFAULT_ENDPOINT,
        type=ConfigValueType.STRING,
        default="https://huggingface.co",
        category=ConfigCategory.HUGGINGFACE,
        label="默认 Endpoint",
        description="Default HuggingFace endpoint",
        required=True,
    )
)

# ═══════════════════════════════════════════════════════════════════
# Notification
# ═══════════════════════════════════════════════════════════════════

ConfigRegistry.register(
    ConfigEntry(
        key=ConfigKey.NOTIFICATION_EMAIL,
        type=ConfigValueType.STRING,
        default="",
        category=ConfigCategory.NOTIFICATION,
        label="接收邮箱",
        description="多个邮箱用逗号分隔",
        ui=UIMetadata(
            widget="input",
            input_type="email",
            placeholder="admin@example.com, ops@example.com",
            helper_text="多个邮箱用逗号分隔",
        ),
    )
)
ConfigRegistry.register(
    ConfigEntry(
        key=ConfigKey.NOTIFICATION_TASK_APPROVAL,
        type=ConfigValueType.BOOL,
        default=True,
        category=ConfigCategory.NOTIFICATION,
        label="任务审批推送",
        description="有新任务需要审批时发送邮件通知",
    )
)
ConfigRegistry.register(
    ConfigEntry(
        key=ConfigKey.AUTO_APPROVE_ENABLED,
        type=ConfigValueType.BOOL,
        default=False,
        category=ConfigCategory.NOTIFICATION,
        label="开启自动审批",
        description="符合条件的任务自动审批",
    )
)
ConfigRegistry.register(
    ConfigEntry(
        key=ConfigKey.AUTO_APPROVE_THRESHOLD_GB,
        type=ConfigValueType.INT,
        default=100,
        category=ConfigCategory.NOTIFICATION,
        label="自动审批阈值 (GB)",
        description="任务空间小于此值时自动审批",
        min_value=0,
    )
)
