"""
Settings Configuration Module
"""

import os
from pathlib import Path
from typing import List
from pydantic import Field

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
    HAS_PYDANTIC_SETTINGS = True
except ImportError:
    from pydantic import BaseModel as BaseSettings
    HAS_PYDANTIC_SETTINGS = False

# Resolve .env from project root: settings.py -> config/ -> app/ -> backend/ -> project_root/
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_ENV_FILE = _PROJECT_ROOT / ".env"

if HAS_PYDANTIC_SETTINGS:
    class Settings(BaseSettings):
        model_config = SettingsConfigDict(
            env_file=str(_ENV_FILE),
            env_file_encoding="utf-8",
            extra="ignore"
        )
        
        PROJECT_NAME: str = "Smart Bug Analyzer"
        API_VERSION: str = "v1"
        DEBUG: bool = False
        
        # Server Settings
        PORT: int = Field(default=8000, validation_alias="PORT")
        HOST: str = Field(default="0.0.0.0", validation_alias="HOST")
        
        # Model Settings
        MODEL_PATH: str = Field(
            default="backend/app/models/optimized_lightgbm_model.pkl",
            validation_alias="MODEL_PATH"
        )
        FEATURE_ENGINEER_PATH: str = Field(
            default="backend/app/models/feature_engineer.pkl",
            validation_alias="FEATURE_ENGINEER_PATH"
        )
        
        # Security Settings
        JWT_SECRET: str = Field(default="super-secret-jwt-key-for-signing-tokens", validation_alias="JWT_SECRET")
        JWT_ALGORITHM: str = Field(default="HS256", validation_alias="JWT_ALGORITHM")
        ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60, validation_alias="ACCESS_TOKEN_EXPIRE_MINUTES")
        
        # Rate Limiting
        RATE_LIMIT_PER_MINUTE: int = Field(default=60, validation_alias="RATE_LIMIT_PER_MINUTE")
        
        # CORS Origins
        CORS_ORIGINS: List[str] = ["*"]
        
        # MLflow Settings
        MLFLOW_TRACKING_URI: str = Field(default="http://localhost:5000", validation_alias="MLFLOW_TRACKING_URI")
        MLFLOW_EXPERIMENT_NAME: str = Field(default="Bug Priority Predictor", validation_alias="MLFLOW_EXPERIMENT_NAME")
        
        # Database Settings
        DATABASE_URL: str = Field(default="sqlite:///backend/data/prediction_history.db", validation_alias="DATABASE_URL")
        MONGO_URI: str = Field(default="", validation_alias="MONGO_URI")
        MONGO_DB_NAME: str = Field(default="bug_priority_db", validation_alias="MONGO_DB_NAME")

        # Gemini Settings
        GEMINI_API_KEY: str = Field(default="", validation_alias="GEMINI_API_KEY")
        GOOGLE_API_KEY: str = Field(default="", validation_alias="GOOGLE_API_KEY")
        GEMINI_MODEL: str = Field(default="gemini-1.5-flash", validation_alias="GEMINI_MODEL")
        
        # Google Auth Settings
        GOOGLE_CLIENT_ID: str = Field(default="", validation_alias="GOOGLE_CLIENT_ID")
else:
    class Settings:
        def __init__(self):
            self.PROJECT_NAME = "Smart Bug Analyzer"
            self.API_VERSION = "v1"
            self.DEBUG = os.getenv("DEBUG", "False").lower() in ("true", "1", "t")
            self.PORT = int(os.getenv("PORT", "8000"))
            self.HOST = os.getenv("HOST", "0.0.0.0")
            self.MODEL_PATH = os.getenv("MODEL_PATH", "backend/app/models/optimized_lightgbm_model.pkl")
            self.FEATURE_ENGINEER_PATH = os.getenv("FEATURE_ENGINEER_PATH", "backend/app/models/feature_engineer.pkl")
            self.JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-jwt-key-for-signing-tokens")
            self.JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
            self.ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
            self.RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))
            self.CORS_ORIGINS = ["*"]
            self.MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000")
            self.MLFLOW_EXPERIMENT_NAME = os.getenv("MLFLOW_EXPERIMENT_NAME", "Bug Priority Predictor")
            self.DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///backend/data/prediction_history.db")
            self.MONGO_URI = os.getenv("MONGO_URI", "")
            self.MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "bug_priority_db")
            self.GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", ""))
            self.GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", self.GEMINI_API_KEY)
            self.GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
            self.GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

settings = Settings()

# Post-process paths to ensure they are absolute and relative to project root
if not os.path.isabs(settings.MODEL_PATH):
    settings.MODEL_PATH = str(os.path.abspath(_PROJECT_ROOT / settings.MODEL_PATH))
if not os.path.isabs(settings.FEATURE_ENGINEER_PATH):
    settings.FEATURE_ENGINEER_PATH = str(os.path.abspath(_PROJECT_ROOT / settings.FEATURE_ENGINEER_PATH))
if settings.DATABASE_URL.startswith("sqlite:///"):
    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    if not os.path.isabs(db_path):
        settings.DATABASE_URL = f"sqlite:///{os.path.abspath(_PROJECT_ROOT / db_path)}"

