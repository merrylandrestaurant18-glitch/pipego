import os
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL", "sqlite:///./plumber_uber.db")
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return database_url


def get_secret_key() -> str:
    secret_key = os.getenv("SECRET_KEY", "local-development-only-change-me")
    if os.getenv("ENVIRONMENT", "development") == "production" and len(secret_key) < 32:
        raise RuntimeError("SECRET_KEY must contain at least 32 characters in production")
    return secret_key


def get_access_token_minutes() -> int:
    return int(os.getenv("ACCESS_TOKEN_MINUTES", "15"))