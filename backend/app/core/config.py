from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ==============================
    # 🔹 Application Settings
    # ==============================
    APP_NAME: str = "FastAPI Backend"
    ENVIRONMENT: str = "development"  # development | production

    # ==============================
    # 🔹 Database Settings
    # ==============================
    MONGODB_URL: str
    DATABASE_NAME: str

    # ==============================
    # 🔹 JWT Settings
    # ==============================
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # ==============================
    # 🔹 Cloudinary Settings
    # ==============================
    CLOUD_NAME: str
    API_KEY: str
    API_SECRET: str
    
    # ==============================
    # 🔹 Optional (Future Use)
    # ==============================
    RAZORPAY_KEY_ID: str | None = None
    RAZORPAY_KEY_SECRET: str | None = None
    # REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    class Config:
        env_file = ".env"
        case_sensitive = True


# Cache settings so it loads once
@lru_cache()
def get_settings():
    return Settings()


settings = get_settings()