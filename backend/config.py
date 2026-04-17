import secrets
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    DATAKB_SECRET_KEY: str = secrets.token_hex(32)
    DATABASE_URL: str = "sqlite+aiosqlite:////data/datakb.db"
    AUTH_MODE: str = "local"

    STORAGE_BACKEND: str = "local"
    STORAGE_LOCAL_PATH: str = "/content"
    STORAGE_GCS_BUCKET: str = ""
    STORAGE_GCS_PREFIX: str = "notebooks/"
    STORAGE_S3_BUCKET: str = ""
    STORAGE_S3_PREFIX: str = "notebooks/"
    STORAGE_S3_REGION: str = "us-east-1"

    SECRETS_DIR: str = "/secrets"

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_ALLOWED_DOMAIN: str = ""

    JUPYTER_SERVER_TOKEN: str = secrets.token_hex(32)

    AUTOSAVE_INTERVAL_SECONDS: int = 60
    KERNEL_IDLE_TIMEOUT_MINUTES: int = 30

    LOG_LEVEL: str = "INFO"

    # JWT config
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
