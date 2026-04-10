"""System configuration management endpoints."""

import asyncio
from typing import Annotated

from loguru import logger
from fastapi import APIRouter, Depends, HTTPException, Query, status

from mgmt_server.api.deps import DbDep
from mgmt_server.api.v1.endpoints.user import AdminUserDep
from mgmt_server.api.v1.schemas.configs import (
    AnnouncementConfigResponse,
    AnnouncementConfigResponseWrapper,
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
    HFEndpointConfigResponseWrapper,
    HFEndpointSaveRequest,
    NotificationConfigResponse,
    NotificationConfigResponseWrapper,
    NotificationSaveRequest,
    SMTPConfigResponse,
    SMTPConfigResponseWrapper,
    SMTPSaveRequest,
    SMTPTestRequest,
    SMTPTestResponse,
)
from database import ConfigDbRepository
from services import EmailClient, SMTPConfig
from services.config import ConfigService

router = APIRouter()


async def get_config_service(db: DbDep) -> ConfigService:
    """Get ConfigService dependency."""
    return ConfigService(db)


ConfigServiceDep = Annotated[ConfigService, Depends(get_config_service)]


@router.get("", response_model=ConfigListResponse)
async def list_configs(
    admin_user: AdminUserDep,
    db: DbDep,
    category: Annotated[str | None, Query(description="Filter by category")] = None,
) -> ConfigListResponse:
    """List all system configurations (admin only).

    Args:
        admin_user: Current admin user (dependency enforces admin role)
        db: Database session
        category: Optional category filter

    Returns:
        List of configurations with total count
    """
    repo = ConfigDbRepository(db)
    configs = await repo.get_all(category=category)

    return ConfigListResponse(
        data=[
            ConfigItem(
                key=config.key,
                value="" if config.is_sensitive else config.value,
                category=config.category,
                description=config.description,
                is_sensitive=config.is_sensitive,
                updated_at=config.updated_at,
            )
            for config in configs
        ],
        total=len(configs),
    )


@router.get("/category/smtp", response_model=SMTPConfigResponseWrapper)
async def get_smtp_config(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
) -> SMTPConfigResponseWrapper:
    """Get SMTP configuration (admin only).

    Args:
        admin_user: Current admin user
        config_service: Config service with caching

    Returns:
        SMTP configuration (password is not included)
    """
    smtp_config = await config_service.get_smtp_config()

    return SMTPConfigResponseWrapper(
        data=SMTPConfigResponse(
            host=smtp_config.host,
            port=smtp_config.port,
            username=smtp_config.username,
            use_tls=smtp_config.use_tls,
            from_email=smtp_config.from_email,
            is_configured=smtp_config.is_configured,
        )
    )


@router.get("/category/huggingface", response_model=HFEndpointConfigResponseWrapper)
async def get_hf_endpoint_config(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
) -> HFEndpointConfigResponseWrapper:
    """Get HuggingFace endpoint configuration (admin only)."""
    endpoints = await config_service.get_hf_endpoints()
    default_endpoint = await config_service.get_hf_default_endpoint()
    return HFEndpointConfigResponseWrapper(
        data=HFEndpointConfigResponse(
            endpoints=endpoints,
            default_endpoint=default_endpoint,
        )
    )


@router.post("/category/smtp/test", response_model=SMTPTestResponse)
async def test_smtp_connection(
    admin_user: AdminUserDep,
    request: SMTPTestRequest,
) -> SMTPTestResponse:
    """Test SMTP connection (admin only).

    Tests the SMTP configuration by attempting to connect and authenticate.

    Args:
        admin_user: Current admin user
        request: SMTP test configuration

    Returns:
        Test result with success status and message
    """
    smtp_config = SMTPConfig(
        host=request.host,
        port=request.port,
        username=request.username,
        password=request.password,
        use_tls=request.use_tls,
        from_email=request.from_email or request.username,
    )
    logger.info("{}", smtp_config)

    client = EmailClient(smtp_config)

    try:
        # 添加 10 秒超时，避免 SMTP 连接挂起导致请求无响应
        success, message = await asyncio.wait_for(
            client.test_connection(),
            timeout=10.0,
        )
    except asyncio.TimeoutError:
        success = False
        message = "SMTP connection timed out after 10 seconds"
        logger.warning(
            "SMTP connection test timeout for admin {} to {}:{}",
            admin_user.email,
            request.host,
            request.port,
        )
    except Exception as e:
        success = False
        message = f"SMTP connection test failed: {e}"
        logger.exception(
            "SMTP connection test failed for admin %s to %s:%s",
            admin_user.email,
            request.host,
            request.port,
        )

    logger.info(
        "SMTP connection test by admin {} to {}:{} - {}",
        admin_user.email,
        request.host,
        request.port,
        "success" if success else "failed",
    )

    return SMTPTestResponse(data=success, test_message=message)


@router.put("/category/smtp", response_model=SMTPConfigResponseWrapper)
async def save_smtp_config(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
    request: SMTPSaveRequest,
) -> SMTPConfigResponseWrapper:
    """Save SMTP configuration (admin only).

    Saves the SMTP configuration. Optionally tests the connection before saving.

    Args:
        admin_user: Current admin user
        config_service: Config service with caching
        request: SMTP configuration to save

    Returns:
        Saved SMTP configuration (password is not included)

    Raises:
        HTTPException: If test_before_save is True and connection test fails
    """
    # Test connection before saving if requested
    if request.test_before_save:
        smtp_config = SMTPConfig(
            host=request.host,
            port=request.port,
            username=request.username,
            password=request.password,
            use_tls=request.use_tls,
            from_email=request.from_email,
        )
        client = EmailClient(smtp_config)
        try:
            success, message = await asyncio.wait_for(
                client.test_connection(),
                timeout=10.0,
            )
        except asyncio.TimeoutError:
            success = False
            message = "SMTP connection timed out after 10 seconds"
        except Exception as e:
            success = False
            message = f"SMTP connection test failed: {e}"

        if not success:
            logger.warning(
                "SMTP save rejected for admin %s - connection test failed: %s",
                admin_user.email,
                message,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"SMTP connection test failed: {message}",
            )

    # Save all SMTP configuration items
    await config_service.set(
        key="smtp_host",
        value=request.host,
        category="email",
        description="SMTP server hostname",
    )
    await config_service.set(
        key="smtp_port",
        value=str(request.port),
        category="email",
        description="SMTP server port",
    )
    await config_service.set(
        key="smtp_username",
        value=request.username,
        category="email",
        description="SMTP authentication username",
    )
    await config_service.set(
        key="smtp_password",
        value=request.password,
        category="email",
        description="SMTP authentication password",
        is_sensitive=True,
    )
    await config_service.set(
        key="smtp_use_tls",
        value=str(request.use_tls).lower(),
        category="email",
        description="Use TLS encryption for SMTP",
    )
    await config_service.set(
        key="smtp_from_email",
        value=request.from_email,
        category="email",
        description="Default sender email address",
    )

    logger.info("SMTP configuration saved by admin %s", admin_user.email)

    return SMTPConfigResponseWrapper(
        data=SMTPConfigResponse(
            host=request.host,
            port=request.port,
            username=request.username,
            use_tls=request.use_tls,
            from_email=request.from_email,
            is_configured=True,
        )
    )


@router.put("/category/huggingface", response_model=HFEndpointConfigResponseWrapper)
async def save_hf_endpoint_config(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
    request: HFEndpointSaveRequest,
) -> HFEndpointConfigResponseWrapper:
    """Save HuggingFace endpoint configuration (admin only)."""
    import json

    cleaned_endpoints = [e.strip() for e in request.endpoints if e.strip()]
    if request.default_endpoint not in cleaned_endpoints:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Default endpoint must be in the endpoints list",
        )

    await config_service.set(
        key="hf_endpoints",
        value=json.dumps(cleaned_endpoints),
        category="huggingface",
        description="可用的 HuggingFace endpoint 列表（JSON 数组）",
    )
    await config_service.set(
        key="hf_default_endpoint",
        value=request.default_endpoint.strip(),
        category="huggingface",
        description="默认使用的 HuggingFace endpoint",
    )

    logger.info("HF endpoint configuration saved by admin %s", admin_user.email)
    return HFEndpointConfigResponseWrapper(
        data=HFEndpointConfigResponse(
            endpoints=cleaned_endpoints,
            default_endpoint=request.default_endpoint.strip(),
        )
    )


@router.get("/category/notification", response_model=NotificationConfigResponseWrapper)
async def get_notification_config(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
) -> NotificationConfigResponseWrapper:
    """Get notification configuration (admin only)."""
    config = await config_service.get_notification_config()
    return NotificationConfigResponseWrapper(
        data=NotificationConfigResponse(
            email=config["email"],
            task_approval_push=config["task_approval_push"],
            auto_approve_enabled=config["auto_approve_enabled"],
            auto_approve_threshold_gb=config["auto_approve_threshold_gb"],
        )
    )


@router.put("/category/notification", response_model=NotificationConfigResponseWrapper)
async def save_notification_config(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
    request: NotificationSaveRequest,
) -> NotificationConfigResponseWrapper:
    """Save notification configuration (admin only)."""
    await config_service.set(
        key="notification_email",
        value=request.email,
        category="notification",
        description="通知接收邮箱，多个用逗号分隔",
    )
    await config_service.set(
        key="notification_task_approval",
        value=str(request.task_approval_push).lower(),
        category="notification",
        description="是否推送任务审批通知",
    )
    await config_service.set(
        key="auto_approve_enabled",
        value=str(request.auto_approve_enabled).lower(),
        category="notification",
        description="是否开启自动审批",
    )
    await config_service.set(
        key="auto_approve_threshold_gb",
        value=str(request.auto_approve_threshold_gb),
        category="notification",
        description="自动审批阈值（GB）",
    )

    logger.info("Notification configuration saved by admin %s", admin_user.email)
    return NotificationConfigResponseWrapper(
        data=NotificationConfigResponse(
            email=request.email,
            task_approval_push=request.task_approval_push,
            auto_approve_enabled=request.auto_approve_enabled,
            auto_approve_threshold_gb=request.auto_approve_threshold_gb,
        )
    )


@router.get("/category/announcement", response_model=AnnouncementConfigResponseWrapper)
async def get_announcement_config(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
) -> AnnouncementConfigResponseWrapper:
    """Get announcement configuration (admin only)."""
    config = await config_service.get_announcement_config()
    return AnnouncementConfigResponseWrapper(
        data=AnnouncementConfigResponse(
            content=config["content"],
            announcement_type=config["announcement_type"],
            is_active=config["is_active"],
        )
    )


@router.put("/category/announcement", response_model=AnnouncementConfigResponseWrapper)
async def save_announcement_config(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
    request: AnnouncementSaveRequest,
) -> AnnouncementConfigResponseWrapper:
    """Save announcement configuration (admin only)."""
    await config_service.set(
        key="system_announcement",
        value=request.content,
        category="announcement",
        description="系统公告内容",
    )
    await config_service.set(
        key="system_announcement_type",
        value=request.announcement_type,
        category="announcement",
        description="公告类型: info/warning/urgent",
    )
    await config_service.set(
        key="system_announcement_active",
        value=str(request.is_active).lower(),
        category="announcement",
        description="是否启用公告",
    )

    logger.info("Announcement configuration saved by admin %s", admin_user.email)
    return AnnouncementConfigResponseWrapper(
        data=AnnouncementConfigResponse(
            content=request.content,
            announcement_type=request.announcement_type,
            is_active=request.is_active,
        )
    )


@router.get("/{key}", response_model=ConfigDetailResponse)
async def get_config(
    key: str,
    admin_user: AdminUserDep,
    db: DbDep,
    config_service: ConfigServiceDep,
) -> ConfigDetailResponse:
    """Get a specific configuration by key (admin only).

    Args:
        key: Configuration key
        admin_user: Current admin user
        db: Database session
        config_service: Config service with caching

    Returns:
        Configuration details

    Raises:
        HTTPException: If configuration not found
    """
    repo = ConfigDbRepository(db)
    config = await repo.get(key)

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Configuration with key '{key}' not found",
        )

    return ConfigDetailResponse(
        data=ConfigItem(
            key=config.key,
            value="" if config.is_sensitive else config.value,
            category=config.category,
            description=config.description,
            is_sensitive=config.is_sensitive,
            updated_at=config.updated_at,
        )
    )


@router.post(
    "", response_model=ConfigCreateResponse, status_code=status.HTTP_201_CREATED
)
async def create_config(
    request: ConfigCreateRequest,
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
) -> ConfigCreateResponse:
    """Create a new configuration (admin only).

    Args:
        request: Configuration create request
        admin_user: Current admin user
        config_service: Config service with caching

    Returns:
        Created configuration

    Raises:
        HTTPException: If configuration key already exists
    """
    # Check if key already exists
    existing = await config_service.config_manager._repo.get(request.key)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Configuration with key '{request.key}' already exists",
        )

    # Create the configuration
    await config_service.set(
        key=request.key,
        value=request.value,
        category=request.category,
        description=request.description,
        is_sensitive=request.is_sensitive,
    )

    # Fetch the created config
    config = await config_service.config_manager._repo.get(request.key)
    assert config is not None  # Should exist after creation

    logger.info("Config created by admin %s: %s", admin_user.email, request.key)

    return ConfigCreateResponse(
        data=ConfigItem(
            key=config.key,
            value="" if config.is_sensitive else config.value,
            category=config.category,
            description=config.description,
            is_sensitive=config.is_sensitive,
            updated_at=config.updated_at,
        )
    )


@router.post("/init", response_model=ConfigListResponse)
async def initialize_default_configs(
    admin_user: AdminUserDep,
    config_service: ConfigServiceDep,
) -> ConfigListResponse:
    """Initialize default configurations (admin only).

    This endpoint creates default configurations if they don't exist.
    Safe to call multiple times - existing configs won't be overwritten.

    Args:
        admin_user: Current admin user
        config_service: Config service with caching

    Returns:
        List of all configurations
    """
    await config_service.initialize_defaults()

    # Return all configs
    configs = await config_service.config_manager._repo.get_all()

    return ConfigListResponse(
        data=[
            ConfigItem(
                key=config.key,
                value="" if config.is_sensitive else config.value,
                category=config.category,
                description=config.description,
                is_sensitive=config.is_sensitive,
                updated_at=config.updated_at,
            )
            for config in configs
        ],
        total=len(configs),
    )


@router.put("/batch", response_model=ConfigListResponse)
async def batch_update_configs(
    request: ConfigBatchUpdateRequest,
    admin_user: AdminUserDep,
    db: DbDep,
    config_service: ConfigServiceDep,
) -> ConfigListResponse:
    """Batch update configurations (admin only).

    Args:
        request: Batch update request with list of config updates
        admin_user: Current admin user
        db: Database session
        config_service: Config service with caching

    Returns:
        Updated list of configurations
    """
    for item in request.configs:
        existing = await config_service.config_manager._repo.get(item.key)
        if existing:
            await config_service.set(
                key=item.key,
                value=item.value,
            )
            logger.info("Config updated by admin %s: %s", admin_user.email, item.key)
        else:
            # Create new configuration if not exists
            await config_service.set(
                key=item.key,
                value=item.value,
                category=item.category or "general",
                description=item.description,
            )
            logger.info("Config created by admin %s: %s", admin_user.email, item.key)

    # Return updated list
    repo = ConfigDbRepository(db)
    configs = await repo.get_all()

    return ConfigListResponse(
        data=[
            ConfigItem(
                key=config.key,
                value="" if config.is_sensitive else config.value,
                category=config.category,
                description=config.description,
                is_sensitive=config.is_sensitive,
                updated_at=config.updated_at,
            )
            for config in configs
        ],
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

    Args:
        key: Configuration key to update
        request: Configuration update request
        admin_user: Current admin user
        config_service: Config service with caching

    Returns:
        Updated configuration

    Raises:
        HTTPException: If configuration not found
    """
    # Check if key exists
    existing = await config_service.config_manager._repo.get(key)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Configuration with key '{key}' not found",
        )

    # Update the configuration
    await config_service.set(
        key=key,
        value=request.value,
        description=request.description,
    )

    # Fetch the updated config
    config = await config_service.config_manager._repo.get(key)
    assert config is not None  # Should exist after update

    logger.info("Config updated by admin %s: %s", admin_user.email, key)

    return ConfigUpdateResponse(
        data=ConfigItem(
            key=config.key,
            value="" if config.is_sensitive else config.value,
            category=config.category,
            description=config.description,
            is_sensitive=config.is_sensitive,
            updated_at=config.updated_at,
        )
    )


@router.delete("/{key}", response_model=ConfigDeleteResponse)
async def delete_config(
    key: str,
    admin_user: AdminUserDep,
    db: DbDep,
) -> ConfigDeleteResponse:
    """Delete a configuration (admin only).

    Args:
        key: Configuration key to delete
        admin_user: Current admin user
        db: Database session

    Returns:
        Delete success response

    Raises:
        HTTPException: If configuration not found
    """
    repo = ConfigDbRepository(db)

    # Check if key exists
    existing = await repo.get(key)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Configuration with key '{key}' not found",
        )

    # Delete the configuration
    await repo.delete(key)

    # Invalidate cache
    ConfigService.invalidate(key)

    logger.info("Config deleted by admin %s: %s", admin_user.email, key)

    return ConfigDeleteResponse()
