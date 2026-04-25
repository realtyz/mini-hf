"""System configuration management endpoints."""

import asyncio
from typing import Annotated

from loguru import logger
from fastapi import APIRouter, HTTPException, Query, status

from mgmt_server.api.deps import AdminUserDep, ConfigServiceDep
from mgmt_server.api.v1.schemas.base import BaseResponse
from mgmt_server.api.v1.schemas.configs import (
    AnnouncementConfigResponse,
    AnnouncementSaveRequest,
    ConfigBatchUpdateRequest,
    ConfigCreateRequest,
    ConfigCreateResponse,
    ConfigDeleteResponse,
    ConfigDetailResponse,
    ConfigItem,
    ConfigListResponse,
    ConfigUpdateRequest,
    ConfigUpdateResponse,
    HFEndpointConfigResponse,
    HFEndpointSaveRequest,
    NotificationConfigResponse,
    NotificationSaveRequest,
    SMTPConfigResponse,
    SMTPSaveRequest,
    SMTPTestRequest,
    SMTPTestResponse,
)
from services import EmailClient, SMTPConfig
from services.config import ConfigUpdateItem, HFEndpointConfig

router = APIRouter()


async def _test_smtp_connection(
    smtp_config: SMTPConfig, timeout: float = 10.0
) -> tuple[bool, str]:
    """Test SMTP connection with timeout."""
    client = EmailClient(smtp_config)
    try:
        success, message = await asyncio.wait_for(
            client.test_connection(),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        success = False
        message = f"SMTP connection timed out after {int(timeout)} seconds"
    except ConnectionError as e:
        success = False
        message = f"SMTP connection test failed: {e}"
    return success, message


@router.get("", response_model=ConfigListResponse)
async def list_configs(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
    category: Annotated[str | None, Query(description="Filter by category")] = None,
) -> ConfigListResponse:
    """List all system configurations (admin only)."""
    configs = await config_service.get_all_models(category=category)
    return ConfigListResponse(
        data=[ConfigItem.from_model(c) for c in configs],
        total=len(configs),
    )


@router.get("/category/smtp", response_model=BaseResponse[SMTPConfigResponse])
async def get_smtp_config(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
) -> BaseResponse[SMTPConfigResponse]:
    """Get SMTP configuration (admin only)."""
    smtp_config = await config_service.get_smtp_config()
    return BaseResponse[SMTPConfigResponse](
        data=SMTPConfigResponse.from_model(smtp_config)
    )


@router.get(
    "/category/huggingface", response_model=BaseResponse[HFEndpointConfigResponse]
)
async def get_hf_endpoint_config(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
) -> BaseResponse[HFEndpointConfigResponse]:
    """Get HuggingFace endpoint configuration (admin only)."""
    config = await config_service.get_hf_config()
    return BaseResponse[HFEndpointConfigResponse](
        data=HFEndpointConfigResponse.from_model(config)
    )


@router.post("/category/smtp/test", response_model=SMTPTestResponse)
async def test_smtp_connection(
    admin_user: AdminUserDep,
    request: SMTPTestRequest,
) -> SMTPTestResponse:
    """Test SMTP connection (admin only)."""
    smtp_config = SMTPConfig(
        host=request.host,
        port=request.port,
        username=request.username,
        password=request.password,
        use_tls=request.use_tls,
        from_email=request.from_email or request.username,
    )

    success, message = await _test_smtp_connection(smtp_config)

    logger.info(
        "SMTP connection test by admin {} to {}:{} - {}",
        admin_user.email,
        request.host,
        request.port,
        "success" if success else "failed",
    )

    return SMTPTestResponse(data=success, test_message=message)


@router.put("/category/smtp", response_model=BaseResponse[SMTPConfigResponse])
async def save_smtp_config(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
    request: SMTPSaveRequest,
) -> BaseResponse[SMTPConfigResponse]:
    """Save SMTP configuration (admin only)."""
    smtp_config = SMTPConfig(
        host=request.host,
        port=request.port,
        username=request.username,
        password=request.password,
        use_tls=request.use_tls,
        from_email=request.from_email,
    )

    if request.test_before_save:
        success, message = await _test_smtp_connection(smtp_config)
        if not success:
            logger.warning(
                "SMTP save rejected for admin {} - connection test failed: {}",
                admin_user.email,
                message,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"SMTP connection test failed: {message}",
            )

    smtp_config = await config_service.save_smtp_config(
        host=smtp_config.host,
        port=smtp_config.port,
        username=smtp_config.username,
        password=smtp_config.password,
        use_tls=smtp_config.use_tls,
        from_email=smtp_config.from_email,
    )

    logger.info("SMTP configuration saved by admin {}", admin_user.email)

    return BaseResponse[SMTPConfigResponse](
        data=SMTPConfigResponse.from_model(smtp_config)
    )


@router.put(
    "/category/huggingface", response_model=BaseResponse[HFEndpointConfigResponse]
)
async def save_hf_endpoint_config(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
    request: HFEndpointSaveRequest,
) -> BaseResponse[HFEndpointConfigResponse]:
    """Save HuggingFace endpoint configuration (admin only)."""
    cleaned_endpoints = [e.strip() for e in request.endpoints if e.strip()]
    if request.default_endpoint not in cleaned_endpoints:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Default endpoint must be in the endpoints list",
        )

    config = await config_service.save_hf_endpoint_config(
        endpoints=cleaned_endpoints,
        default_endpoint=request.default_endpoint.strip(),
    )

    logger.info("HF endpoint configuration saved by admin {}", admin_user.email)
    return BaseResponse[HFEndpointConfigResponse](
        data=HFEndpointConfigResponse.from_model(config)
    )


@router.get(
    "/category/notification", response_model=BaseResponse[NotificationConfigResponse]
)
async def get_notification_config(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
) -> BaseResponse[NotificationConfigResponse]:
    """Get notification configuration (admin only)."""
    config = await config_service.get_notification_config()
    return BaseResponse[NotificationConfigResponse](
        data=NotificationConfigResponse.from_model(config)
    )


@router.put(
    "/category/notification", response_model=BaseResponse[NotificationConfigResponse]
)
async def save_notification_config(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
    request: NotificationSaveRequest,
) -> BaseResponse[NotificationConfigResponse]:
    """Save notification configuration (admin only)."""
    config = await config_service.save_notification_config(
        email=request.email,
        task_approval_push=request.task_approval_push,
        auto_approve_enabled=request.auto_approve_enabled,
        auto_approve_threshold_gb=request.auto_approve_threshold_gb,
    )

    logger.info("Notification configuration saved by admin {}", admin_user.email)
    return BaseResponse[NotificationConfigResponse](
        data=NotificationConfigResponse.from_model(config)
    )


@router.get(
    "/category/announcement", response_model=BaseResponse[AnnouncementConfigResponse]
)
async def get_announcement_config(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
) -> BaseResponse[AnnouncementConfigResponse]:
    """Get announcement configuration (admin only)."""
    config = await config_service.get_announcement_config()
    return BaseResponse[AnnouncementConfigResponse](
        data=AnnouncementConfigResponse.from_model(config)
    )


@router.put(
    "/category/announcement", response_model=BaseResponse[AnnouncementConfigResponse]
)
async def save_announcement_config(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
    request: AnnouncementSaveRequest,
) -> BaseResponse[AnnouncementConfigResponse]:
    """Save announcement configuration (admin only)."""
    config = await config_service.save_announcement_config(
        content=request.content,
        announcement_type=request.announcement_type,
        is_active=request.is_active,
    )

    return BaseResponse[AnnouncementConfigResponse](
        data=AnnouncementConfigResponse.from_model(config)
    )


@router.get("/{key}", response_model=ConfigDetailResponse)
async def get_config(
    key: str,
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
) -> ConfigDetailResponse:
    """Get a specific configuration by key (admin only)."""
    config = await config_service.get_model(key)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Configuration with key '{key}' not found",
        )
    return ConfigDetailResponse(data=ConfigItem.from_model(config))


@router.post(
    "", response_model=ConfigCreateResponse, status_code=status.HTTP_201_CREATED
)
async def create_config(
    request: ConfigCreateRequest,
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
) -> ConfigCreateResponse:
    """Create a new configuration (admin only)."""
    config = await config_service.create(
        key=request.key,
        value=request.value,
        category=request.category,
        description=request.description,
        is_sensitive=request.is_sensitive,
    )

    logger.info("Config created by admin {}: {}", admin_user.email, request.key)
    return ConfigCreateResponse(data=ConfigItem.from_model(config))


@router.post("/init", response_model=ConfigListResponse)
async def initialize_default_configs(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
) -> ConfigListResponse:
    """Initialize default configurations (admin only).

    Safe to call multiple times - existing configs won't be overwritten.
    """
    await config_service.initialize_defaults()
    configs = await config_service.get_all_models()
    return ConfigListResponse(
        data=[ConfigItem.from_model(c) for c in configs],
        total=len(configs),
    )


@router.put("/batch", response_model=ConfigListResponse)
async def batch_update_configs(
    request: ConfigBatchUpdateRequest,
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
) -> ConfigListResponse:
    """Batch update configurations (admin only)."""
    items = [
        ConfigUpdateItem(
            key=item.key,
            value=item.value,
            category=item.category or "general",
            description=item.description,
            is_sensitive=item.is_sensitive,
        )
        for item in request.configs
    ]
    await config_service.batch_update(items)
    logger.info(
        "Batch config update by admin {}: %d items",
        admin_user.email,
        len(request.configs),
    )

    configs = await config_service.get_all_models()
    return ConfigListResponse(
        data=[ConfigItem.from_model(c) for c in configs],
        total=len(configs),
    )


@router.put("/{key}", response_model=ConfigUpdateResponse)
async def update_config(
    key: str,
    request: ConfigUpdateRequest,
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
) -> ConfigUpdateResponse:
    """Update a configuration (admin only).

    Uses set_partial to preserve existing category and is_sensitive
    without a separate read-modify-write cycle.
    """
    config = await config_service.set_partial(
        key=key,
        value=request.value,
        description=request.description,
    )

    if config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Configuration with key '{key}' not found",
        )

    logger.info("Config updated by admin {}: {}", admin_user.email, key)
    return ConfigUpdateResponse(data=ConfigItem.from_model(config))


@router.delete("/{key}", response_model=ConfigDeleteResponse)
async def delete_config(
    key: str,
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
) -> ConfigDeleteResponse:
    """Delete a configuration (admin only)."""
    deleted = await config_service.delete(key)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Configuration with key '{key}' not found",
        )
    logger.info("Config deleted by admin {}: {}", admin_user.email, key)
    return ConfigDeleteResponse()
