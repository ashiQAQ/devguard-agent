"""
配置管理
"""

from pydantic_settings import BaseSettings
from typing import List, Optional
import os


class Settings(BaseSettings):
    """应用配置"""
    
    # 应用信息
    APP_NAME: str = "DevGuard Agent"
    APP_VERSION: str = "2.4.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    # API 配置
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "8000"))
    API_PREFIX: str = "/api"
    
    # 数据库配置（MySQL）
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "mysql+pymysql://root:Abc123456Abc123456@localhost:3306/devguard?charset=utf8mb4"
    )
    SQLALCHEMY_ECHO: bool = DEBUG
    
    # Redis 配置
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # C++ 引擎配置
    CPP_ENGINE_HOST: str = os.getenv("CPP_ENGINE_HOST", "localhost")
    CPP_ENGINE_PORT: int = int(os.getenv("CPP_ENGINE_PORT", "9000"))
    CPP_ENGINE_TIMEOUT: int = 30  # 秒
    
    # GitHub 配置
    GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")
    GITHUB_API_URL: str = "https://api.github.com"
    
    # GitLab 配置
    GITLAB_TOKEN: str = os.getenv("GITLAB_TOKEN", "")
    GITLAB_API_URL: str = os.getenv("GITLAB_API_URL", "https://gitlab.com/api/v4")
    
    # ============================================
    # AI 配置（统一字段，所有提供者共用）
    # ============================================
    # AI 提供者: openai / azure / local / mock
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "mock")
    
    # API Key（OpenAI / Azure / Local 都用这个）
    AI_API_KEY: str = os.getenv("AI_API_KEY", "")
    
    # API 端点（OpenAI base_url / Azure endpoint / Local URL）
    AI_BASE_URL: str = os.getenv("AI_BASE_URL", "https://api.openai.com/v1")
    
    # 模型名称
    AI_MODEL: str = os.getenv("AI_MODEL", "gpt-4o")
    
    # Embedding 模型
    AI_EMBEDDING_MODEL: str = os.getenv("AI_EMBEDDING_MODEL", "text-embedding-3-small")
    
    # Azure 专用（API 版本）
    AI_API_VERSION: str = os.getenv("AI_API_VERSION", "2024-02-01")
    
    # 模型参数
    AI_MAX_TOKENS: int = int(os.getenv("AI_MAX_TOKENS", "4096"))
    AI_TEMPERATURE: float = float(os.getenv("AI_TEMPERATURE", "0.3"))
    AI_TIMEOUT: int = int(os.getenv("AI_TIMEOUT", "60"))
    
    # AI 功能配置
    AI_CACHE_ENABLED: bool = os.getenv("AI_CACHE_ENABLED", "true").lower() == "true"
    AI_CACHE_TTL: int = int(os.getenv("AI_CACHE_TTL", "3600"))
    AI_MAX_CONTENT_LENGTH: int = int(os.getenv("AI_MAX_CONTENT_LENGTH", "8000"))
    AI_BATCH_SIZE: int = int(os.getenv("AI_BATCH_SIZE", "5"))
    
    # 仿真配置
    SIMULATION_ADCU_BINARY: str = os.getenv(
        "SIMULATION_ADCU_BINARY",
        "/usr/local/bin/devguard-adcu"
    )
    SIMULATION_SCENARIO_DIR: str = os.getenv(
        "SIMULATION_SCENARIO_DIR",
        "/data/scenarios"
    )
    SIMULATION_TIMEOUT: int = 300  # 秒
    
    # 日志配置
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    LOG_FILE: str = os.getenv("LOG_FILE", "logs/devguard.log")
    
    # CORS 配置
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
    ]
    
    # 性能配置
    MAX_WORKERS: int = int(os.getenv("MAX_WORKERS", "4"))
    REQUEST_TIMEOUT: int = 60  # 秒
    
    # 功能开关
    ENABLE_FLOW_A: bool = True
    ENABLE_FLOW_B: bool = True
    ENABLE_SIMULATION: bool = True
    ENABLE_AI_ANALYSIS: bool = True
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# 全局配置实例
settings = Settings()
