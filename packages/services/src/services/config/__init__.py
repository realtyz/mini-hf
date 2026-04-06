"""Configuration management module for services package.

This module provides configuration management with a clear separation between
internal implementation and public API.

Public API (use these from external code):
- ConfigService: Business-level configuration service with high-level helpers
  and typed configuration objects. This is the recommended entry point for
  all external configuration access.

Internal API (for services package use only):
- ConfigProvider: Low-level configuration provider with caching and encryption.
  External code should prefer ConfigService which provides higher-level
  abstractions.

Example:
    from services.config import ConfigService

    # Using ConfigService (recommended for external code)
    config_service = ConfigService(session)
    smtp_config = await config_service.get_smtp_config()
    email_client = await config_service.get_email_client()
"""

from services.config.service import ConfigService

__all__ = [
    "ConfigService",
]
