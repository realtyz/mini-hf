"""System configuration management endpoints."""

from typing import Annotated

from loguru import logger
from fastapi import APIRouter, Query, status

from mgmt_server.api.deps import AdminUserDep, ConfigManagementServiceDep
from mgmt_server.core.exceptions import NotFoundError
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
from services import SMTPConfig
from services.config import ConfigUpdateItem

router = APIRouter()


@router.get("", response_model=ConfigListResponse)
async def list_configs(
    admin_user: AdminUserDep,
    svc: ConfigManagementServiceDep,
    category: Annotated[str | None, Query(description="Filter by category")] = None,
) -> ConfigListResponse:
    configs = await svc.list_configs(category=category)
    return ConfigListResponse(
        data=[ConfigItem.from_model(c) for c in configs],
        total=len(configs),
    )


@router.get("/category/smtp", response_model=BaseResponse[SMTPConfigResponse])
async def get_smtp_config(
    admin_user: AdminUserDep,
    svc: ConfigManagementServiceDep,
) -> BaseResponse[SMTPConfigResponse]:
    smtp_config = await svc.get_smtp_config()
    return BaseResponse[SMTPConfigResponse](
        data=SMTPConfigResponse.from_model(smtp_config)
    )


@router.get(
    "/category/huggingface", response_model=BaseResponse[HFEndpointConfigResponse]
)
async def get_hf_endpoint_config(
    admin_user: AdminUserDep,
    svc: ConfigManagementServiceDep,
) -> BaseResponse[HFEndpointConfigResponse]:
    config = await svc.get_hf_config()
    return BaseResponse[HFEndpointConfigResponse](
        data=HFEndpointConfigResponse.from_model(config)
    )


@router.post("/category/smtp/test", response_model=SMTPTestResponse)
async def test_smtp_connection(
    admin_user: AdminUserDep,
    request: SMTPTestRequest,
    svc: ConfigManagementServiceDep,
) -> SMTPTestResponse:
    smtp_config = SMTPConfig(
        host=request.host,
        port=request.port,
        username=request.username,
        password=request.password,
        use_tls=request.use_tls,
        from_email=request.from_email or request.username,
    )
    success, message = await svc.test_smtp(smtp_config)
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
    svc: ConfigManagementServiceDep,
    request: SMTPSaveRequest,
) -> BaseResponse[SMTPConfigResponse]:
    smtp_config = SMTPConfig(
        host=request.host,
        port=request.port,
        username=request.username,
        password=request.password,
        use_tls=request.use_tls,
        from_email=request.from_email,
    )
    result = await svc.save_smtp_config(
        smtp_config=smtp_config,
        test_before_save=request.test_before_save,
        admin_email=admin_user.email,
    )
    return BaseResponse[SMTPConfigResponse](
        data=SMTPConfigResponse.from_model(result)
    )


@router.put(
    "/category/huggingface", response_model=BaseResponse[HFEndpointConfigResponse]
)
async def save_hf_endpoint_config(
    admin_user: AdminUserDep,
    svc: ConfigManagementServiceDep,
    request: HFEndpointSaveRequest,
) -> BaseResponse[HFEndpointConfigResponse]:
    config = await svc.save_hf_config(
        endpoints=request.endpoints,
        default_endpoint=request.default_endpoint,
        admin_email=admin_user.email,
    )
    return BaseResponse[HFEndpointConfigResponse](
        data=HFEndpointConfigResponse.from_model(config)
    )


@router.get(
    "/category/notification", response_model=BaseResponse[NotificationConfigResponse]
)
async def get_notification_config(
    admin_user: AdminUserDep,
    svc: ConfigManagementServiceDep,
) -> BaseResponse[NotificationConfigResponse]:
    config = await svc.get_notification_config()
    return BaseResponse[NotificationConfigResponse](
        data=NotificationConfigResponse.from_model(config)
    )


@router.put(
    "/category/notification", response_model=BaseResponse[NotificationConfigResponse]
)
async def save_notification_config(
    admin_user: AdminUserDep,
    svc: ConfigManagementServiceDep,
    request: NotificationSaveRequest,
) -> BaseResponse[NotificationConfigResponse]:
    config = await svc.save_notification_config(
        email=request.email,
        task_approval_push=request.task_approval_push,
        auto_approve_enabled=request.auto_approve_enabled,
        auto_approve_threshold_gb=request.auto_approve_threshold_gb,
        admin_email=admin_user.email,
    )
    return BaseResponse[NotificationConfigResponse](
        data=NotificationConfigResponse.from_model(config)
    )


@router.get(
    "/category/announcement", response_model=BaseResponse[AnnouncementConfigResponse]
)
async def get_announcement_config(
    admin_user: AdminUserDep,
    svc: ConfigManagementServiceDep,
) -> BaseResponse[AnnouncementConfigResponse]:
    config = await svc.get_announcement_config()
    return BaseResponse[AnnouncementConfigResponse](
        data=AnnouncementConfigResponse.from_model(config)
    )


@router.put(
    "/category/announcement", response_model=BaseResponse[AnnouncementConfigResponse]
)
async def save_announcement_config(
    admin_user: AdminUserDep,
    svc: ConfigManagementServiceDep,
    request: AnnouncementSaveRequest,
) -> BaseResponse[AnnouncementConfigResponse]:
    config = await svc.save_announcement_config(
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
    svc: ConfigManagementServiceDep,
) -> ConfigDetailResponse:
    config = await svc.get_config(key)
    if not config:
        raise NotFoundError(f"Configuration with key '{key}' not found")
    return ConfigDetailResponse(data=ConfigItem.from_model(config))


@router.post(
    "", response_model=ConfigCreateResponse, status_code=status.HTTP_201_CREATED
)
async def create_config(
    request: ConfigCreateRequest,
    admin_user: AdminUserDep,
    svc: ConfigManagementServiceDep,
) -> ConfigCreateResponse:
    config = await svc.create_config(
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
    svc: ConfigManagementServiceDep,
) -> ConfigListResponse:
    await svc.initialize_defaults()
    configs = await svc.list_configs()
    return ConfigListResponse(
        data=[ConfigItem.from_model(c) for c in configs],
        total=len(configs),
    )


@router.put("/batch", response_model=ConfigListResponse)
async def batch_update_configs(
    request: ConfigBatchUpdateRequest,
    admin_user: AdminUserDep,
    svc: ConfigManagementServiceDep,
) -> ConfigListResponse:
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
    await svc.batch_update(items)
    logger.info(
        "Batch config update by admin {}: {} items",
        admin_user.email,
        len(request.configs),
    )
    configs = await svc.list_configs()
    return ConfigListResponse(
        data=[ConfigItem.from_model(c) for c in configs],
        total=len(configs),
    )


@router.put("/{key}", response_model=ConfigUpdateResponse)
async def update_config(
    key: str,
    request: ConfigUpdateRequest,
    admin_user: AdminUserDep,
    svc: ConfigManagementServiceDep,
) -> ConfigUpdateResponse:
    config = await svc.update_config(
        key=key,
        value=request.value,
        description=request.description,
    )
    if config is None:
        raise NotFoundError(f"Configuration with key '{key}' not found")
    logger.info("Config updated by admin {}: {}", admin_user.email, key)
    return ConfigUpdateResponse(data=ConfigItem.from_model(config))


@router.delete("/{key}", response_model=ConfigDeleteResponse)
async def delete_config(
    key: str,
    admin_user: AdminUserDep,
    svc: ConfigManagementServiceDep,
) -> ConfigDeleteResponse:
    deleted = await svc.delete_config(key)
    if not deleted:
        raise NotFoundError(f"Configuration with key '{key}' not found")
    logger.info("Config deleted by admin {}: {}", admin_user.email, key)
    return ConfigDeleteResponse()
