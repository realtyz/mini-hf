"""Application configuration."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_ignore_empty=True,
        extra="ignore",
    )

    # JWT settings
    JWT_SECRET_KEY: str
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_ALGORITHM: str = "HS256"

    # Encryption settings (for sensitive config values)
    # If not set, falls back to JWT_SECRET_KEY for backward compatibility
    CONFIG_ENCRYPTION_KEY: str | None = None

    # PostgreSQL settings
    PG_HOST: str
    PG_PORT: int
    PG_USERNAME: str
    PG_PASSWORD: str
    PG_DATABASE: str

    # Application settings
    DEBUG: bool = False
    HF_SERVER_URL: str

    # Redis settings (for worker)
    REDIS_URL: str

    # Admin user settings (for auto-creation on first startup)
    DEFAULT_ADMIN_EMAIL: str = "admin@example.com"
    DEFAULT_ADMIN_PASSWORD: str = "changeme"

    INCOMPLETE_FILE_PATH: str

    # Worker settings
    WORKER_POLL_INTERVAL: float = 2.0
    WORKER_MAX_CONCURRENT: int = 1
    WORKER_CANCEL_CHECK_INTERVAL: float = 5.0
    WORKER_CONCURRENT_DOWNLOADS: int = 3
    WORKER_CONCURRENT_UPLOADS: int = 3
    WORKER_CONCURRENT_S3_CHECKS: int = 5
    WORKER_PROGRESS_INTERVAL: float = 2.0
    WORKER_STALE_FILE_AGE_SECONDS: int = 86400
    WORKER_MAX_REPO_STORAGE_GB: float = -1.0
    WORKER_MAX_RETRIES: int = 3
    WORKER_RETRY_BASE_DELAY: float = 10.0
    WORKER_RETRY_MAX_DELAY: float = 120.0

    # S3 settings
    S3_ENDPOINT: str
    S3_ACCESS_KEY: str
    S3_SECRET_KEY: str
    S3_BUCKET_NAME: str
    S3_REGION: str = "us-east-1"
    S3_USE_SSL: bool = False
    S3_VERIFY_SSL: bool = False


settings = Settings()  # type: ignore
